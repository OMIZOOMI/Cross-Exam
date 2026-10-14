# Veyra / Behind the surface

One authored 35-second, silent product film. Remotion 4.0.535 renders React/SVG
projected website planes into an independent H.264 MP4; the landing does not run
Remotion. No product architecture or scanner/browser authority is reused.

## Storyboard

| Seconds | Visual argument |
| --- | --- |
| 0–4 | Finished FIELDWORK synthetic website; YOUR WEBSITE LOOKS FINE. |
| 4–8 | Camera tilts; UI, structure, components, resources, dependencies and evidence separate in depth. |
| 8–12 | Anchor traces connect the layers; the page is a physical system. |
| 12–16 | A synthetic stale hero-asset reference produces a 404 pulse while the page still renders. |
| 16–22 | An orange Veyra inspection plane crosses the layers; blue evidence attaches to the selected path. |
| 22–26 | A slow-script claim meets a direct resource-status challenge. The causal explanation is withdrawn. |
| 26–30 | Camera/tracing isolates hero component → stale reference → 404. Other layers dim. |
| 30–33 | Scoped DEMO verdict and recommended reference update/verification; no code repair. Layers reassemble. |
| 33–35 | VEYRA. YOUR WEBSITE SAYS IT WORKS. PROVE IT. Clean held brand frame. |

The top-level synthetic label is present throughout. This is an independently
authored fictional system, not a live scan, provider run or observed reproduction;
it does not relabel the existing contested C-005 report as confirmed. The inspection
plane and verdict illustrate the investigation model, not enabled public execution.

## Reproduce the assets

The renderer has its own workspace and lockfile. The product dependency graph
is unchanged. From the repository root:

```sh
pnpm --dir tools/veyra-film install --frozen-lockfile
pnpm film:typecheck
pnpm film:render
pnpm film:poster
```

1920×1080, 30 fps, 1050 frames, H.264/yuv420p, CRF 22/slow. Remotion's bundled
FFmpeg encodes locally. Temporary rendering frames/cache are not deliverables.
Only the source, final MP4 and WebP poster enter Git. No audio or copyrighted music.
Sharp 0.35.5 (already used by Next) converts the encoded frame into a WebP poster.
The two pinned Fontsource families are bundled locally under SIL OFL 1.1:
Barlow Condensed and IBM Plex Mono. No runtime font/CDN requests. Remotion's
[license](https://www.remotion.dev/license) applies to the isolated authoring tool;
it does not add billing or a paywall to Veyra. No rendering service is deployed.

Landing playback is user-initiated, muted, inline, non-looping and `preload=none`.
The independently useful poster is visible before play and for reduced-motion
users, who may explicitly opt into the film. A text equivalent describes every
story beat. The final encode has progressive MP4 metadata before media data.

## Delivery encode

35.000 seconds; 1920×1080; H.264/avc1 yuv420p; 30 fps; 1050 frames; no audio.
Final MP4: 4,362,327 bytes (4.16 MiB), SHA-256
`1e23f3ac09afd1aef98ffe16ec176d63025221a5c34341a670a6f446530a35fa`.
Poster: 100,180 bytes (97.8 KiB), SHA-256
`95af1d1d3683a8e4525d76acd35c9a3fd77b8f88a2e8fc512fbd63ea7c53c67d`.
Metadata, complete decode, encoded-shot visual inspection and production browser
play/pause/end/replay were verified. Browser checks cover Chromium desktop/mobile
emulation, not every browser or physical device.
