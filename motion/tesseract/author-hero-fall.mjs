import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Native Tesseract 0.3.1 composition-local actions. No raster artwork or fonts.
// Apply to the inspected empty 600 × 300, 1.6 s hero-fall.tsrct composition.
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, ".tesseract-work", "hero-fall.actions.json");
const duration = 1600;
const gold = [201 / 255, 165 / 255, 102 / 255, 1];
const crimson = [137 / 255, 65 / 255, 73 / 255, 1];
const actions = [];
const transform = (position = [0, 0], opacity = 100) => ({
  anchorPoint: [0, 0], position, scale: [100, 100], rotation: 0, opacity,
});
const base = (type, layerId, name, parentLayerId) => ({
  type, compositionId: "main", layerId, name,
  ...(parentLayerId ? { parentLayerId } : {}),
  activeRange: { start: 0, duration },
});
const group = (id, name, parent, position) => actions.push({
  ...base("createFxGroupLayer", id, name, parent), transform: transform(position),
});
const move = (x, y) => ({ type: "moveTo", x, y });
const line = (x, y) => ({ type: "lineTo", x, y });
const curve = (c1x, c1y, c2x, c2y, x, y) => ({
  type: "cubicTo", c1x, c1y, c2x, c2y, x, y,
});
const close = { type: "close" };
const stroke = (color = gold, width = 1.6, opacity = 1) => ({
  paint: { type: "solid", color }, width, cap: "round", join: "round",
  miterLimit: 4, blendMode: "normal", opacity,
});
const fill = (color = gold, opacity = 0.08) => ({
  paint: { type: "solid", color }, fillRule: "nonZeroWinding", blendMode: "normal", opacity,
});
const shape = (id, name, parent, commands, strokes = [stroke()], fills = []) => actions.push({
  ...base("createFxShapeLayer", id, name, parent),
  transform: transform(), shape: { path: { commands }, strokes, fills },
});
const easing = { type: "cubicBezier", x1: 0.25, y1: 0, x2: 0.45, y2: 1 };
const keys = (layerId, propertyType, poses) => actions.push({
  type: "setFxPropertyKeyframes", compositionId: "main",
  property: { layerId, propertyType },
  keyframes: poses.map(([layerTime, value], i) => ({
    id: `hero-fall-${layerId}-${propertyType}-${i}`, layerTime,
    value: { type: "float", value }, easing: i ? easing : { type: "linear" },
  })),
});

group(1, "Fallen hero crest · alpha overlay", undefined, [0, 0]);
group(10, "Left fractured shield and laurel", 1, [300, 142]);
group(20, "Right fractured shield and laurel", 1, [300, 142]);
group(30, "Falling shield tip", 1, [300, 142]);
group(40, "Quiet embers", 1, [300, 142]);

// Three independent editable shield fragments share a jagged fracture seam.
const seam = [line(4, 30), line(7, 14), line(-4, -3), line(5, -24), line(-2, -41)];
shape(11, "Shield · left facet", 10, [
  move(0, -70), line(-60, -47), curve(-61, -6, -54, 21, -40, 43),
  line(-19, 42), line(-4, 35), line(4, 43), ...seam, close,
], [stroke()], [fill()]);
shape(21, "Shield · right facet", 20, [
  move(0, -70), line(60, -47), curve(61, -6, 54, 21, 40, 43),
  line(22, 38), line(4, 43), ...seam, close,
], [stroke()], [fill()]);
shape(31, "Shield · lower broken tip", 30, [
  move(-40, 43), curve(-32, 58, -13, 73, 0, 80), curve(13, 73, 32, 58, 40, 43),
  line(22, 38), line(4, 43), line(-4, 35), line(-19, 42), close,
], [stroke()], [fill()]);

// A small native leaf crest splits with the shield, with muted red in the seam.
shape(12, "Leaf · left blade", 10, [
  move(-1, -22), curve(-25, -14, -33, 4, -3, 23), curve(-12, 4, -10, -11, -1, -22), close,
], [stroke(gold, 1.25, 0.86)], [fill(gold, 0.12)]);
shape(22, "Leaf · right blade", 20, [
  move(1, -22), curve(25, -14, 33, 4, 3, 23), curve(12, 4, 10, -11, 1, -22), close,
], [stroke(gold, 1.25, 0.86)], [fill(gold, 0.12)]);
shape(32, "Crimson fracture", 30, [move(-2, -37), line(5, -24), line(-4, -3), line(7, 14), line(4, 30)],
  [stroke(crimson, 1.1, 0.65)]);
keys(32, "opacity", [[0, 0], [350, 0], [550, 75], [960, 0]]);

// Restrained laurel: native curved paths, not text or a supplied logo.
for (const [parent, sign] of [[10, -1], [20, 1]]) {
  shape(parent + 3, `Laurel · ${sign < 0 ? "left" : "right"} stem`, parent,
    [move(sign * 39, 54), curve(sign * 72, 25, sign * 86, -9, sign * 80, -42)],
    [stroke(gold, 1.1, 0.62)]);
  for (let i = 0; i < 4; i++) {
    const x = sign * (55 + i * 7), y = 35 - i * 21;
    shape(parent + 4 + i, `Laurel · leaf ${i + 1}`, parent, [
      move(x, y), curve(x + sign * 13, y - 2, x + sign * 16, y - 12, x + sign * 13, y - 18),
      curve(x + sign * 4, y - 15, x, y - 7, x, y), close,
    ], [stroke(gold, 1, 0.63)], [fill(gold, 0.045)]);
  }
}

// Coordinated transform tracks: a short hold, then the weight falls gently apart.
keys(1, "opacity", [[0, 0], [140, 100], [980, 100], [1510, 0], [1599, 0]]);
for (const [id, dx, dy, rotation] of [[10, -13, 8, -5], [20, 13, 8, 5], [30, 0, 21, 1.5]]) {
  keys(id, "positionX", [[0, 300], [410, 300], [1250, 300 + dx]]);
  keys(id, "positionY", [[0, 142], [410, 142], [1250, 142 + dy]]);
  keys(id, "rotation", [[0, 0], [410, 0], [1250, rotation]]);
  keys(id, "opacity", [[0, 100], [440, 100], [1110, 30], [1460, 0]]);
}

const embers = [
  [-29, -4, -23, -22], [24, -11, 23, -19], [-3, 27, -11, -18],
  [39, 21, 23, -15], [-37, 30, -23, -16], [9, -34, 9, -20],
];
for (let i = 0; i < embers.length; i++) {
  const [x, y, dx, dy] = embers[i], id = 41 + i;
  shape(id, `Ember · ${i + 1}`, 40,
    [move(-1.3, -2.4), line(1.4, 0), line(0, 2.4), line(-1.4, 0), close], [],
    [fill(i % 3 === 0 ? crimson : gold, 0.8)]);
  const arrival = 570 + i * 35;
  keys(id, "positionX", [[0, x], [arrival, x], [1380, x + dx]]);
  keys(id, "positionY", [[0, y], [arrival, y], [1380, y + dy]]);
  keys(id, "opacity", [[0, 0], [arrival - 60, 0], [arrival + 100, 60], [1420, 0]]);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(actions, null, 2)}\n`);
console.log(`${actions.length} native actions written to ${output}`);
