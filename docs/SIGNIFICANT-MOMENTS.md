# Significant game moments

The table briefly marks a changed main quest stage, a completed side quest, a destroyed hero, victory and defeat. Ordinary phases, draws, plays, damage and counter changes do not start these effects. If one action produces several milestones, the outcome takes priority, followed by the stage change, hero destruction and side-quest completion.

The presentation reads the rules state before and after a committed action. It never dispatches a game action, advances a phase, dismisses an event review or changes a save. In-play hero destruction requires both the hero leaving play and a new engine destruction record; capture, reshuffling and living removals do not count. A Lost and Alone hero's later discard from its owner's deck follows that card's special death rule. Switching between established Foundations of Stone areas changes the view without announcing a new stage. Initial setup, opening or importing a save, undo and retry do not replay a milestone.

## Three animation sources

- **Remotion 4.0.530** supplies frame-based vector emblems through the Player in `src/ui/SignificantMomentVisual.tsx`. The stage, side-quest and outcome decorations play once for two seconds at 30 fps. Editable composition registrations live in [motion/remotion](../motion/remotion/README.md).
- **Hyperframes 0.8.141** supplies the authored entrance, hold and exit timeline. Its scoped GSAP 3.15.0 timeline is shared with `src/ui/significant-moment-timeline.ts`. The native [Hyperframes project](../motion/hyperframes/significant-moments/README.md) includes its fonts, local timeline dependency and reproduction instructions. CLI lint, inspect and render checks produced a silent 2.1-second preview.
- **Tesseract 0.3.1** supplies the fallen-hero crest: a native shield and leaf separate into restrained fragments and embers. The editable [Tesseract project](../motion/tesseract/README.md) exports a silent 1.6-second transparent VP9 WebM, with a transparent poster. The shipped video is 98,261 bytes and is requested only for a hero-fall event.

Readable event text remains ordinary HTML outside the decorative composition. There is no audio, looping, flashing or camera shake. Decorations do not intercept pointer input. Victory and defeat use the existing result dialog; other moments use a short ribbon above the table.

## Lifecycle and accessibility

Pending choices, event reviews and card/quest inspection defer the table ribbon. Once those close, the effect starts; its timer and timeline are cleaned up on unmount or replacement. Navigating away, switching games, importing a save and undo clear the transient presentation. The result dialog reserves its emblem space so dismissal does not shift its controls.

With `prefers-reduced-motion: reduce`, the same announcement uses static text and a simple SVG mark. Neither the Remotion chunk nor the Tesseract video is loaded. Event text is announced through a polite status region. The regular ribbon lasts 2.3 seconds; the static version lasts 2.6 seconds.

## Verification

All 28 cases in `tests/significant-moments.test.ts` pass, covering real stage changes, side-quest completion, hero destruction, outcomes and the excluded ordinary or living-removal events. `npm run test:significant-moments` passes 28 browser checkpoints at 1280/390 pixels with normal and reduced motion, including all five real events, 132 verified review pauses, actual video playback, choices, inspection, undo, reload and unchanged engine state. Its 20 screenshots show no horizontal overflow, and the run records no browser errors. The existing `test:motion` suite passes all 14 groups of checks and verifies that presentation preserves player-controlled progression. The complete engine suite passes 2,678 cases.

The source animations were also checked independently: all five Remotion Players at 1280/390/320 pixels, the Hyperframes CLI lint/inspect/render pipeline, and Tesseract native filmstrip, alpha decoding and actual browser playback. Generated browser reports and screenshots are written under the ignored `output/` directory; small native Tesseract previews remain alongside its editable project.
