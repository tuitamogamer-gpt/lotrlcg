# Significant game moments

This composition follows the repository's [DESIGN.md](../../../DESIGN.md),
with the existing gold token from [styles.css](../../../src/styles.css).
It is a compact, silent milestone ribbon for quest advance, victory, defeat,
and the loss of a hero. Ordinary card plays and phase changes stay quiet.

## Colors

- `#1f2522`: charcoal ribbon backing.
- `#eee8d8`: parchment title and live text.
- `#846b36`: brass frame.
- `#cfb276`: existing table gold, emblem and fine rule.
- `#485b42`: forest inset.

## Typography

IM Fell English SC titles and Crimson Pro supporting text use the game's
self-hosted OFL fonts. Labels remain live HTML in the game.

## Motion

Only opacity and transforms animate. A short stagger enters after 0.12 s,
the fully visible message holds from 0.66 to 1.72 s, then resolves by 2.02 s.
At 30 fps the composition has 63 frames (2.1 s). Reduced motion in the live
game shows the same static message and does not start a timeline.

## What not to do

- No routine phase or card-play animation.
- No audio, flashes, screen shakes, confetti, or infinite ambient effects.
- No game action, state mutation, dismissal, or input lock from animation.
- No full-screen overlay; the ribbon stays below 440 by 160 CSS pixels.
