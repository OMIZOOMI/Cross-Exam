# Veyra scroll-driven cross-section prototype

Standalone, scroll-driven proof-of-concept for the interactive 3D website cross-section. It uses
HTML, CSS 3D transforms, SVG-free DOM trace geometry, and synthetic data; it does not touch the
production Next.js app or make network requests.

The public presentation is an electric-blue Veyra experience influenced by Whenevr's confident
composition, dimensional color, and clear hierarchy. The page opens on a bright white hero with a
blue/ultramarine/violet atmospheric form, then becomes a full-viewport dark stage: a familiar website
lifts toward the upper-left while its five connected systems unfold downward beneath it.

## Run locally

From this directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173/>.

## Interaction

- Scroll through the pinned `#showcase` section to drive the complete reversible choreography.
- Scroll progress moves from the visible surface, through the CTA interaction, camera preparation,
  upper-left lift, downward layer cascade, animated blue/violet connection network, and evidence verdict.
- **Drag** inside the viewport to add a manual camera orbit; focus the viewport and use the arrow
  keys to orbit or `Home` to clear the manual offset. Page scrolling remains the primary controller.
- At the expanded end state, hover or focus any layer to dim the others, emphasize its associated
  connections, and read a short explanation of that system. The integrated **investigation inspector**
  explains observed evidence, the two challenged hypotheses, the supported route conclusion, and the
  scoped recommendation without stacking long copy on the planes.
- The post-stage story sections turn the investigation into a memorable proof loop: Evidence → Claim
  → Challenge → Verdict, followed by Veyra's evidence boundary and no-auto-fix promise.
- With reduced motion enabled, easing and ambient loops are removed while the scroll story remains
  available as a calm, deterministic sequence.

The highlighted route mismatch and recommended `/pricing` target are illustrative only. The fixture
is labeled **SYNTHETIC DEMO**; no public scan, live reproduction, network request, or automatic fix
is activated.
