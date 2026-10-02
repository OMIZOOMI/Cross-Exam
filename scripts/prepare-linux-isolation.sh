#!/usr/bin/env bash
set -euo pipefail
phase=init
trap 'code=$?; echo "::error title=Linux isolation preparation::phase=$phase exit=$code" >&2; exit "$code"' ERR

root=/var/lib/crossexam
runtime="$root/runtime"
browser="$root/browser"
prepared_root="$root/root"
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

phase=root
sudo -n install -d -m 0755 "$prepared_root" "$prepared_root/app" "$prepared_root/browser" "$prepared_root/runtime" "$prepared_root/etc" "$prepared_root/run/crossexam" "$prepared_root/tmp" "$prepared_root/var/tmp" "$prepared_root/proc" "$prepared_root/dev" "$prepared_root/sys" "$prepared_root/usr/bin" "$prepared_root/usr/share/fonts" "$prepared_root/etc/fonts"
sudo -n cp -aL "$runtime/probe.cjs" "$runtime/node_modules" "$runtime/test-cert.pem" "$prepared_root/app/"
sudo -n cp -aL "$node_target" "$prepared_root/runtime/node"
sudo -n cp -aL "$browser"/. "$prepared_root/browser/"
sudo -n cp -aL /usr/bin/env /usr/bin/sleep /bin/sh "$prepared_root/usr/bin/"
sudo -n cp -aL /etc/fonts/. "$prepared_root/etc/fonts/" 2>/dev/null || true
sudo -n cp -aL /usr/share/fonts/. "$prepared_root/usr/share/fonts/" 2>/dev/null || true
: | sudo -n tee "$prepared_root/etc/hosts" "$prepared_root/etc/resolv.conf" >/dev/null
copy_deps() {
  local executable="$1"
  local dependency
  local deps
  deps=$(sudo -n "$(command -v node)" node_modules/tsx/dist/cli.mjs scripts/resolve-runtime-deps.ts "$executable") || {
    echo "::error title=Linux isolation preparation::cannot resolve runtime dependencies for $executable" >&2
    exit 1
  }
  while IFS= read -r dependency; do
    test -n "$dependency" || continue
    test -f "$dependency" || {
      echo "::error title=Linux isolation preparation::missing runtime dependency $dependency for $executable" >&2
      exit 1
    }
    sudo -n cp -aL --parents "$dependency" "$prepared_root"
  done <<< "$deps"
}
for executable in "$prepared_root/runtime/node" "$prepared_root/usr/bin/env" "$prepared_root/usr/bin/sleep" "$prepared_root/usr/bin/sh"; do
  test -f "$executable" || continue
  copy_deps "$executable"
done
while IFS= read -r executable; do
  copy_deps "$executable"
done < <(find "$prepared_root/browser" -type f -name chrome -perm -111 -print)
for library in libnss3.so libnssutil3.so libsmime3.so libnspr4.so libplc4.so libplds4.so libsoftokn3.so libfreebl3.so libnssckbi.so; do
  for candidate in "/usr/lib/x86_64-linux-gnu/$library" "/lib/x86_64-linux-gnu/$library" "/usr/lib/$library"; do
    test -f "$candidate" || continue
    copy_deps "$candidate"
    sudo -n cp -aL --parents "$candidate" "$prepared_root"
  done
done
sudo -n find "$prepared_root" -type d -exec chmod 0755 {} +
sudo -n find "$prepared_root" -type f -exec chmod a-w {} +
sudo -n chown -R root:root "$prepared_root"
sudo -n chmod 0755 "$prepared_root" "$prepared_root/tmp" "$prepared_root/var/tmp"
phase=verify-exec
for executable in "$prepared_root/usr/bin/env" "$prepared_root/runtime/node"; do
  test -f "$executable" && test -x "$executable" || {
    echo "::error title=Linux isolation preparation::missing or non-executable runtime binary $executable" >&2
    exit 1
  }
done
sudo -n chroot "$prepared_root" /usr/bin/env /runtime/node -e "process.exit(0)" || {
  echo "::error title=Linux isolation preparation::prepared-root exec chain failed inside chroot" >&2
  exit 1
}
phase=seal
sudo -n "$(command -v node)" node_modules/tsx/dist/cli.mjs scripts/seal-prepared-root.ts "$prepared_root"
sudo -n chmod 0444 "$prepared_root/.crossexam-root-manifest.json"

phase=fixtures
sentinel=/home/crossexam-host-sentinel
sudo -n sh -c "printf 'host-only sentinel\\n' > '$sentinel'; chmod 0600 '$sentinel'"
