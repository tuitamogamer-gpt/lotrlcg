# Significant game moments

The live game uses `src/ui/SignificantMomentVisual.tsx` through the Remotion
Player. Five quiet, transparent rune compositions cover a changed quest stage,
a completed side quest, a fallen hero, victory and defeat. Each is 440 × 160,
60 frames at 30 fps, plays once, and contains no audio or controls.

The composition has no game logic. The parent detects an already committed
rules change, keeps readable text as ordinary HTML, and lazy-loads the Player
only when reduced motion is disabled. Saves, reloads, opening the board,
ordinary phase changes and card draws do not start these animations.

`Root.tsx` registers the same composition source as five independently editable
timelines. `index.ts` is the entry point for Remotion Studio if the development
CLI is installed. Studio/renderer packages are not required by the live game.
The Player preview is the production animation; no rendered movie is required
for these vector decorations.

All motion is derived from `useCurrentFrame()` and `interpolate()`. Static SVG
geometry, restrained warm colors and short light-line reveals keep the board
legible. The Tesseract hero-fall layer is a separate optional media asset, owned
by the enclosing event presentation. HTML text stays outside the fixed-size
composition so it remains readable on narrow screens.
