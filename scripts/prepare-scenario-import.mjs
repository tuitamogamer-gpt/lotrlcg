import { readFile, writeFile, mkdir, stat, rename, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = new URL("..", import.meta.url);
const args = process.argv.slice(2);
let recipeId,
  download = false,
  checkOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--recipe") recipeId = args[++i];
  else if (args[i] === "--download") download = true;
  else if (args[i] === "--check") checkOnly = true;
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!recipeId)
  throw new Error(
    "Usage: npm run prepare:scenario-import -- --recipe Q05.1 [--download] [--check]",
  );
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const catalog = await readJson("public/catalog.json");
const recipes = await readJson("public/scenarios.json");
const selected = recipes.find((r) => r.id === recipeId);
if (
  !selected ||
  selected.campaign ||
  !["standard", "easy"].includes(selected.mode)
)
  throw new Error("Choose an existing original standard/easy scenario recipe.");
const title = (name) => name.replace(/\s*\(Easy\)$/i, "").trim();
const name = title(selected.name);
const slug = name
  .normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const matching = recipes.filter(
  (r) =>
    !r.campaign &&
    ["standard", "easy"].includes(r.mode) &&
    title(r.name) === name,
);
if (
  matching.filter((r) => r.mode === "standard").length !== 1 ||
  matching.filter((r) => r.mode === "easy").length !== 1
)
  throw new Error("The source must contain one standard and one easy recipe.");
const ids = [...new Set(matching.flatMap((r) => r.card_codes))].sort();
const cards = ids.map((id) => {
  const c = catalog.find((c) => c.code === id);
  if (!c || c.nightmare || !c.official)
    throw new Error(`Missing original official card: ${id}`);
  return structuredClone(c);
});
for (const recipe of matching) {
  if (new Set(recipe.card_codes).size !== recipe.card_codes.length)
    throw new Error(`Duplicate identity in ${recipe.id}`);
  const reconstructed = {};
  for (const row of recipe.cards) {
    if (
      !ids.includes(row.code) ||
      !Number.isSafeInteger(row.quantity) ||
      row.quantity <= 0
    )
      throw new Error(`Invalid physical recipe row in ${recipe.id}`);
    (reconstructed[row.section] ??= {})[row.code] =
      (reconstructed[row.section]?.[row.code] ?? 0) + row.quantity;
  }
  for (const section of new Set([
    ...Object.keys(reconstructed),
    ...Object.keys(recipe.sections),
  ])) {
    const ordered = (value) =>
      JSON.stringify(
        Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      );
    if (ordered(reconstructed[section]) !== ordered(recipe.sections[section]))
      throw new Error(`Recipe section mismatch: ${recipe.id}/${section}`);
  }
}
const summary = {
  name,
  slug,
  cards: cards.length,
  recipes: matching.map((r) => ({
    id: r.id,
    mode: r.mode,
    sections: Object.fromEntries(
      Object.entries(r.sections).map(([section, rows]) => [
        section,
        Object.values(rows).reduce((n, quantity) => n + quantity, 0),
      ]),
    ),
  })),
};
if (checkOnly) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
const artMapPath = "src/data/reference-scenario-art.json";
let artMap;
try {
  artMap = await readJson(artMapPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  artMap = {};
}
const artwork = [];
function imageInfo(bytes) {
  if (!(
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ))
    throw new Error("Downloaded artwork must be a JPEG or PNG image.");
  if (bytes.length < 1000 || bytes.length > 8 * 1024 * 1024)
    throw new Error("Unexpected artwork size.");
  return {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
if (download) {
  await mkdir(new URL("public/cards/", root), { recursive: true });
  // Download separate immutable faces; do not change the automation registry.
  for (const c of cards) {
    for (const [field, face] of [
      ["imagesrc", "front"],
      ["back_imagesrc", "back"],
    ]) {
      if (!c[field]) continue;
      const source = c[field].startsWith("/")
        ? `https://ringsdb.com${c[field]}`
        : c[field];
      const url = new URL(source);
      if (
        url.protocol !== "https:" ||
        !["dragncards-lotrlcg.s3.amazonaws.com", "ringsdb.com"].includes(
          url.hostname,
        )
      )
        throw new Error(`Unsupported artwork source for ${c.code}`);
      const identity = c.code.replace(/^octgn:/, "");
      if (!/^[a-zA-Z0-9-]+$/.test(identity))
        throw new Error(`Invalid artwork identity: ${c.code}`);
      const extension = url.pathname.toLowerCase().endsWith(".png")
        ? "png"
        : "jpg";
      const localPath = `/cards/${identity}${face === "back" ? ".B" : ""}.${extension}`;
      const destination = fileURLToPath(new URL(`public${localPath}`, root));
      try {
        await stat(destination);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        const temporary = `${destination}.download`;
        try {
          await run("curl", [
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--retry",
            "2",
            "--max-time",
            "40",
            source,
            "--output",
            temporary,
          ]);
          imageInfo(await readFile(temporary));
          await rename(temporary, destination);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      artwork.push({
        code: c.code,
        face,
        source,
        localPath,
        ...imageInfo(await readFile(destination)),
      });
      artMap[c[field]] = localPath;
      c[field] = localPath;
    }
  }
  await writeFile(
    new URL(artMapPath, root),
    `${JSON.stringify(Object.fromEntries(Object.entries(artMap).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`,
  );
}
const bundle = {
  schema: "lotr-pending-scenario-import/v1",
  status: "pending-rules",
  name,
  slug,
  sources: {
    catalog: "public/catalog.json",
    recipes: "public/scenarios.json",
    expansionRules: matching.some((r) => r.pack_codes.includes("TLR"))
      ? "https://images-cdn.fantasyflightgames.com/filer_public/88/d6/88d6e80d-e75d-468f-8484-76c56b15e895/mec38_insert_web.pdf"
      : undefined,
  },
  cards,
  recipes: matching,
  artwork,
};
await mkdir(new URL("src/data/pending/", root), { recursive: true });
await writeFile(
  new URL(`src/data/pending/${slug}-import.json`, root),
  `${JSON.stringify(bundle, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    { ...summary, artwork: artwork.length, status: bundle.status },
    null,
    2,
  ),
);
