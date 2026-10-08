# Fallen hero crest

`hero-fall.tsrct` is the portable, editable Tesseract source for
[`public/motion/hero-fall.webm`](../../public/motion/hero-fall.webm).
The animation runs once for a significant hero-loss event; game text belongs in
the HTML interface. It contains no audio or text, camera shake, flash, or looping.

The 600 × 300 composition lasts 1.6 seconds. A restrained gold shield and leaf
crest briefly holds, separates into three native vector fragments, and dims
with six small drifting embers. Gold is `#c9a566`; the fracture uses muted
crimson `#894149`. The source contains 59 applied authoring actions and 32
editable AnimationGraph tracks coordinating grouped fragments and embers.
Every visual element is a native Shape or Group; no raster design is embedded.

## Reproduction

The skill's `references/cli-version.txt` pins Tesseract **0.3.1**. That exact
Linux x86_64 release was downloaded from
`https://github.com/mirage-hq/tesseract/releases/download/v0.3.1/`, checked against
its published `.zip.sha256`, installed, and verified with `tsrct --version`.

The authoring canvas and duration were set through `project checkout` and
`project commit`. `node author-hero-fall.mjs` writes the supported native action
batch to `.tesseract-work/hero-fall.actions.json`. Apply it to the empty inspected
`main` composition with `project apply`; the committed `.tsrct` is authoritative.
Do not reapply creation actions to the completed document.

Export the root graphic group using the installed CLI's absolute path:

```sh
"$TESSERACT_CLI" export --project hero-fall.tsrct --format prores \
  --fx-solo main:1 --resolution 1080p --fps 30 \
  --output .tesseract-work/hero-fall-master-alpha.mov
ffmpeg -i .tesseract-work/hero-fall-master-alpha.mov -vf format=yuva420p \
  -c:v libvpx-vp9 -b:v 0 -crf 33 -deadline good -cpu-used 2 \
  -row-mt 1 -auto-alt-ref 0 -an ../../public/motion/hero-fall.webm
```

The checked source exports at 600 × 300 with this CLI export setting. The solo
ProRes intermediate is `yuva444p12le` with 48 frames at 30 fps. It stays in the
ignored working folder; the game ships only the 98,261-byte WebM. VP9 stores the
alpha as auxiliary data: inspect with the `libvpx-vp9` decoder and
`-vf alphaextract`, rather than relying on ffprobe's default `yuv420p` label.

This headless host lacked a Vulkan driver. A user-local, unpacked Debian 13
Mesa 25.0.7 lavapipe driver supplied software rendering through
`VK_DRIVER_FILES`; no privileged system installation or CLI version substitution
was used. Other machines can use their supported Vulkan driver.

## Review

The native saved revision was rendered with Tesseract filmstrip samples at
0, 140, 410, 600, 800, 1000, 1250, and 1450 ms. Its decoded alpha was then
composited over dark and light backgrounds to inspect the thin outline and
fragment edges. The readable matching filmstrip is
[`Previews/hero-fall-filmstrip.png`](Previews/hero-fall-filmstrip.png), and the
silent dark-background preview is
[`Previews/hero-fall-preview.mp4`](Previews/hero-fall-preview.mp4).

Alpha extraction confirmed values from 0 to 255, including transparent canvas
corners and the intended opaque outline. Native and WebM metadata both confirm
1.6 seconds, 600 × 300, and 30 fps, with no audio stream. The separate browser
proof checks real-time Chromium playback and decoded transparent pixels.
[`public/motion/hero-fall.png`](../../public/motion/hero-fall.png) is a
600 × 300 transparent poster sampled at 0.7 seconds using the VP9 alpha decoder.
It provides the same visible crest while video data is loading or unsupported.
For reduced motion, the application omits this animation; static event text
remains independently available.
