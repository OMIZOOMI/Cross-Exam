import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScanReportSchema } from "@crossexam/contracts";
import { safeRequest } from "@crossexam/engine/security";
import { expect, it, vi } from "vitest";
import { executeRequest } from "../../../packages/engine/src/security/request-core";
import { EgressError } from "../../../packages/engine/src/security/types";
import { DeterministicScanRunner } from "./runner";

vi.mock("@crossexam/engine/security", () => ({ safeRequest: vi.fn() }));

const targetUrl = "https://veyra-fixture.example.com/";
const fixturePaths = new Set(["/", "/pricing-old", "/pricing", "/robots.txt", "/sitemap.xml"]);

function document(title: string, body = "") {
  return `<!doctype html><html lang="en"><head><title>${title}</title>
<meta name="description" content="Owned Veyra test page">
<meta name="viewport" content="width=device-width"></head><body><h1>${title}</h1>${body}</body></html>`;
}

it("follows a broken Pricing link, then follows the repaired link on a fresh scan", async () => {
  let pricingLink = "/pricing-old";
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "";
    requests.push(path);
    if (path === "/robots.txt") {
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("User-agent: *\nDisallow:\n");
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("content-security-policy", "default-src 'none'");
    if (path === "/") {
      response.end(document("Home", `<a href="${pricingLink}">Pricing</a>`));
    } else if (path === "/pricing") {
      response.end(document("Pricing"));
    } else {
      response.statusCode = 404;
      response.end(document("Not found"));
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Only this test routes to the owned server. The production scanner still uses fixed DNS and transport.
    vi.mocked(safeRequest).mockImplementation((url, options = {}) =>
      executeRequest(url, options, {
        resolve: async (hostname) => {
          if (hostname !== new URL(targetUrl).hostname) throw new Error("Unexpected fixture host");
          return [{ address: "93.184.216.34", family: 4 }];
        },
        transport: async (target, _pin, { method, signal, maxBodyBytes }) => {
          const url = new URL(target.url);
          if (
            url.origin !== new URL(targetUrl).origin ||
            url.search ||
            !fixturePaths.has(url.pathname)
          )
            throw new Error("Unexpected fixture URL");
          const response = await fetch(new URL(url.pathname, origin), {
            method,
            signal,
            redirect: "error",
          });
          const body = new Uint8Array(await response.arrayBuffer());
          if (body.length > maxBodyBytes) throw new EgressError("RESPONSE_TOO_LARGE", "response");
          return {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers),
            body,
          };
        },
      }),
    );
    const runner = new DeterministicScanRunner();
    const scan = async () => {
      const result = await runner.run({ targetUrl, maxPages: 8, timeoutMs: 10000 });
      if (result.status !== "completed")
        throw new Error(`Unexpected scan result: ${result.status}`);
      const report = ScanReportSchema.parse(result.report);
      expect(report.summary.status).toBe("completed");
      expect(report.agentRuns).toEqual([]);
      return report;
    };

    const before = await scan();
    expect(requests.splice(0)).toEqual(["/", "/robots.txt", "/sitemap.xml", "/pricing-old"]);
    expect(before.pages).toMatchObject([
      { path: "/", linksTo: ["P-2"] },
      { path: "/pricing-old", statusCode: 404 },
    ]);
    const evidence = before.evidence.find(
      (item) => item.code === "HTTP_STATUS" && item.url.endsWith("/pricing-old"),
    );
    expect(evidence).toMatchObject({ provenance: "OBSERVED", data: { statusCode: 404 } });
    expect(before.findings).toMatchObject([
      {
        title: "Document returned HTTP 404",
        affectedPaths: ["/pricing-old"],
        evidenceIds: [evidence?.id],
      },
    ]);

    pricingLink = "/pricing";
    const after = await scan();
    expect(requests).toEqual(["/", "/robots.txt", "/sitemap.xml", "/pricing"]);
    expect(after.summary.id).not.toBe(before.summary.id);
    expect(after.pages).toMatchObject([
      { path: "/", linksTo: ["P-2"] },
      { path: "/pricing", statusCode: 200 },
    ]);
    expect(after.findings).toEqual([]);

    if (process.env.VEYRA_EXPORT_PRICING_TEST === "1") {
      const output = await mkdtemp(join(tmpdir(), "veyra-pricing-test-"));
      const receipt = {
        context: "Controlled local HTTP fixture; DNS and routing supplied by the test",
        before,
        after,
      };
      await writeFile(join(output, "reports.json"), JSON.stringify(receipt, null, 2), {
        mode: 0o600,
      });
      console.info(`Veyra before-and-after reports: ${output}/reports.json`);
    }
  } finally {
    vi.mocked(safeRequest).mockReset();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
