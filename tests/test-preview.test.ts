import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readPreviewArtifact,
  assertPreviewPortAvailable,
  waitForPreviewArtifact,
  startTestPreview,
} from "../scripts/test-preview.mjs";

const html = '<script type="module" src="/assets/index-audit.js"></script>';
const body = "export const build = 'readiness-audit';";
async function fixture(t: any) {
  const directory = await mkdtemp(join(tmpdir(), "lotrlcg-preview-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), html);
  await writeFile(join(directory, "assets/index-audit.js"), body);
  return { directory, artifact: await readPreviewArtifact(directory) };
}
async function server(t: any, content = body, index = html) {
  const instance = createServer((request, response) => {
    response.writeHead(200);
    response.end(request.url === "/" ? index : content);
  });
  await new Promise<void>((resolve) =>
    instance.listen(0, "127.0.0.1", resolve),
  );
  t.after(
    () => new Promise<void>((resolve) => instance.close(() => resolve())),
  );
  const port = (instance.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, port, instance };
}

test("preview readiness checks actual HTTP200 module bytes against the dist artifact", async (t) => {
  const { artifact } = await fixture(t);
  const { url } = await server(t);
  const witness = await waitForPreviewArtifact(url, artifact);
  assert.equal(witness.status, 200);
  assert.equal(witness.sha256, artifact.sha256);
  assert.equal(witness.bytes, Buffer.byteLength(body));
  assert.equal(witness.url, `${url}/assets/index-audit.js`);
});

test("wrong module names and wrong bytes fail readiness even when the endpoint returns HTTP200", async (t) => {
  const { artifact } = await fixture(t);
  const wrongBytes = await server(t, body + "\n// stale build");
  await assert.rejects(
    waitForPreviewArtifact(wrongBytes.url, artifact),
    /wrong main-module bytes/,
  );
  const wrongEntry = await server(
    t,
    body,
    html.replace("index-audit", "index-stale"),
  );
  await assert.rejects(
    waitForPreviewArtifact(wrongEntry.url, artifact),
    /wrong main module/,
  );
});

test("an unrelated occupied port fails before a preview child can be started", async (t) => {
  const { directory } = await fixture(t);
  const { port } = await server(t, "unrelated server", "<title>marker</title>");
  await assert.rejects(
    assertPreviewPortAvailable(port),
    /port .* is unavailable/,
  );
  await assert.rejects(
    startTestPreview({
      port,
      distDirectory: directory,
      outputDirectory: join(directory, "proof"),
      githubEnvFile: null,
    }),
    /port .* is unavailable/,
  );
});

test("a dead child and a never-ready endpoint cannot turn the readiness deadline into success", async (t) => {
  const { artifact } = await fixture(t);
  const { url, instance } = await server(t);
  await assert.rejects(
    waitForPreviewArtifact(url, artifact, {
      child: { exitCode: 1, signalCode: null },
    }),
    /exited before readiness/,
  );
  await new Promise<void>((resolve) => instance.close(() => resolve()));
  await assert.rejects(
    waitForPreviewArtifact(url, artifact, { timeoutMs: 80, pollMs: 5 }),
    /readiness timed out/,
  );
});

test("the supervised real Vite preview provides readiness bytes and CI checksum settings", async (t) => {
  const { directory, artifact } = await fixture(t);
  const { port, instance } = await server(t);
  await new Promise<void>((resolve) => instance.close(() => resolve()));
  const githubEnvFile = join(directory, "github-env");
  const result = await startTestPreview({
    port,
    distDirectory: directory,
    outputDirectory: join(directory, "proof"),
    githubEnvFile,
  });
  t.after(() => {
    try {
      process.kill(-result.pid, "SIGTERM");
    } catch {}
  });
  assert.equal(result.witness.sha256, artifact.sha256);
  assert.doesNotThrow(() => process.kill(result.pid, 0));
  const environment = await readFile(githubEnvFile, "utf8");
  assert.match(
    environment,
    new RegExp(`^GAME_URL=http://127\\.0\\.0\\.1:${port}$`, "m"),
  );
  assert.match(environment, /^EXPECTED_ENTRY=index-audit\.js$/m);
  assert.ok(environment.includes(`EXPECTED_ENTRY_SHA256=${artifact.sha256}\n`));
  assert.equal(
    environment.includes("RELEASE_SHA="),
    false,
    "preview bytes do not attest a remote commit",
  );
});
