#!/usr/bin/env bash
set -euo pipefail
phase=init
trap 'code=$?; echo "::error title=Linux isolation preparation::phase=$phase exit=$code" >&2; exit "$code"' ERR

root=/var/lib/crossexam
runtime="$root/runtime"
browser="$root/browser"
node_target=/opt/crossexam-runtime/node

phase=account
sudo -n useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin crossexam-worker 2>/dev/null || true
phase=directories
sudo -n rm -rf "$root" /opt/crossexam-runtime /run/crossexam
sudo -n install -d -m 0755 "$runtime" "$browser" /opt/crossexam-runtime
sudo -n install -d -m 1777 /run/crossexam
phase=node
sudo -n install -m 0755 "$(readlink -f "$(command -v node)")" "$node_target"

probe_bundle=$(mktemp)
trap 'rm -f "$probe_bundle"' EXIT
phase=bundle
pnpm exec esbuild tests/linux-isolation/probe.ts --bundle --platform=node --format=cjs --external:@playwright/test --outfile="$probe_bundle"
phase=modules
sudo -n install -m 0755 "$probe_bundle" "$runtime/probe.cjs"
sudo -n mkdir -p "$runtime/node_modules/@playwright"
playwright_test_dir=$(readlink -f node_modules/@playwright/test)
playwright_dir=$(find node_modules/.pnpm -path '*/node_modules/playwright' -type d -print -quit)
playwright_core_dir=$(find node_modules/.pnpm -path '*/node_modules/playwright-core' -type d -print -quit)
test -n "$playwright_dir" -a -n "$playwright_core_dir"
sudo -n cp -aL "$playwright_test_dir" "$runtime/node_modules/@playwright/test"
sudo -n cp -aL "$playwright_dir" "$runtime/node_modules/playwright"
sudo -n cp -aL "$playwright_core_dir" "$runtime/node_modules/playwright-core"
phase=browser
test -d "$HOME/.cache/ms-playwright"
for browser_cache in "$HOME"/.cache/ms-playwright/*; do
  test -d "$browser_cache" || continue
  sudo -n cp -aL "$browser_cache" "$browser"/
done
sudo -n install -m 0644 packages/engine/src/security/fixtures/test-cert.pem "$runtime/test-cert.pem"
: | sudo -n tee "$runtime/resolv.conf" >/dev/null
: | sudo -n tee "$runtime/hosts" >/dev/null
sudo -n chmod -R a+rX "$runtime" "$browser"
sudo -n chmod 0755 "$runtime/probe.cjs" "$node_target"

phase=fixtures
sentinel=/host-crossexam-sentinel
sudo -n sh -c "printf 'host-only sentinel\\n' > '$sentinel'; chmod 0600 '$sentinel'"
