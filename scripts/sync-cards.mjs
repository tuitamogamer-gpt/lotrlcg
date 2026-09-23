import fs from "node:fs/promises";
const metaPath = "public/data-metadata.json";
let metadata = {};
try {
  metadata = JSON.parse(await fs.readFile(metaPath, "utf8"));
} catch {
  /* first sync */
}
const fields = [
  "code",
  "name",
  "type_code",
  "sphere_code",
  "cost",
  "threat",
  "willpower",
  "attack",
  "defense",
  "health",
  "traits",
  "text",
  "is_unique",
  "pack_name",
  "pack_code",
  "illustrator",
  "imagesrc",
  "url",
  "quantity",
];
for (const [key, url, path] of [
  ["catalog", "https://ringsdb.com/api/public/cards/", "public/catalog.json"],
  [
    "core",
    "https://ringsdb.com/api/public/cards/core.json",
    "src/data/player-cards.json",
  ],
]) {
  const headers = {};
  if (metadata[key]?.etag) headers["If-None-Match"] = metadata[key].etag;
  if (metadata[key]?.lastModified)
    headers["If-Modified-Since"] = metadata[key].lastModified;
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (r.status === 304) {
    console.log(`${key}: unchanged`);
    continue;
  }
  if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
  const data = await r.json();
  if (
    !Array.isArray(data) ||
    !data.every(
      (c) =>
        typeof c.code === "string" &&
        typeof c.name === "string" &&
        typeof c.type_code === "string" &&
        typeof c.sphere_code === "string",
    )
  )
    throw new Error(`${key}: unexpected data schema`);
  const clean = data.map((c) =>
    Object.fromEntries(
      fields.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]),
    ),
  );
  await fs.writeFile(
    `${path}.tmp`,
    JSON.stringify(clean, null, key === "core" ? 2 : undefined) + "\n",
  );
  await fs.rename(`${path}.tmp`, path);
  metadata[key] = {
    url,
    count: clean.length,
    retrievedAt: new Date().toISOString(),
    etag: r.headers.get("etag"),
    lastModified: r.headers.get("last-modified"),
  };
  console.log(`${key}: ${clean.length} cards`);
}
await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2) + "\n");
