# Significant moment ribbon

Native Hyperframes HTML source, scaffolded with Hyperframes CLI 0.8.141's blank
template. It is 800 × 300 at 30 fps, 2.1 seconds, with no audio. The game scales
the same visual language into a ribbon no larger than 440 × 160 CSS pixels.

The finite GSAP choreography is ported into
[significant-moment-timeline.ts](../../../src/ui/significant-moment-timeline.ts).
That helper animates only three scoped decoration elements and returns cleanup.
Reduced motion leaves the live HTML message static. Animation never owns rules,
input, save data, or game-state transitions.

From this directory:

```sh
npm run check
npx --yes hyperframes@0.8.141 preview --background --port 3027 --no-open
npx --yes hyperframes@0.8.141 preview --status
npm run render -- --fps 30
npx --yes hyperframes@0.8.141 preview --stop
```

The Studio URL is `http://localhost:3027/#project/significant-moments`.
`index.html` is composition source, rather than the Studio surface.
Always run `npm run check` after editing the HTML. It checks lint, runtime,
layout, motion, and text contrast in one headless browser session.

The bundled title and body fonts are copied from the game's existing Fontsource
packages; their OFL licenses are included beside them.
The local GSAP 3.15.0 script matches the game dependency and keeps authoring
independent of a CDN; its license notice is retained in the script header.
