#!/usr/bin/env bash
set -euo pipefail

root=/var/lib/crossexam
runtime="$root/runtime"
browser="$root/browser"
node_target=/opt/crossexam-runtime/node

sudo -n useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin crossexam-worker 2>/dev/null || true
sudo -n rm -rf "$root" /opt/crossexam-runtime /run/crossexam
sudo -n install -d -m 0755 "$runtime" "$browser" /opt/crossexam-runtime /run/crossexam
sudo -n install -m 0755 "$(readlink -f "$(command -v node)")" "$node_target"

probe_bundle=$(mktemp)
trap 'rm -f "$probe_bundle"' EXIT
pnpm exec esbuild tests/linux-isolation/probe.ts --bundle --platform=node --format=cjs --external:@playwright/test --outfile="$probe_bundle"
sudo -n install -m 0755 "$probe_bundle" "$runtime/probe.cjs"
sudo -n mkdir -p "$runtime/node_modules"
sudo -n cp -aL node_modules/@playwright "$runtime/node_modules"
sudo -n cp -aL node_modules/playwright "$runtime/node_modules"
sudo -n cp -aL node_modules/playwright-core "$runtime/node_modules"
browser_cache=$(find "$HOME/.cache/ms-playwright" -mindepth 1 -maxdepth 1 -type d | head -n 1)
test -n "$browser_cache"
sudo -n cp -aL "$browser_cache"/. "$browser"/
sudo -n install -m 0644 packages/engine/src/security/fixtures/test-cert.pem "$runtime/test-cert.pem"
: | sudo -n tee "$runtime/resolv.conf" >/dev/null
: | sudo -n tee "$runtime/hosts" >/dev/null
sudo -n chmod -R a+rX "$runtime" "$browser"
sudo -n chmod 0755 "$runtime/probe.cjs" "$node_target"

sentinel=/host-crossexam-sentinel
sudo -n sh -c "printf 'host-only sentinel\\n' > '$sentinel'; chmod 0600 '$sentinel'"
