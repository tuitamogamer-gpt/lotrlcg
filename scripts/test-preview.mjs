import { createHash } from "node:crypto";
import { readFile, mkdir, open, appendFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export function mainModulePath(html) {
  const modules = [...html.matchAll(/<script\b[^>]*>/gi)].flatMap(([tag]) => {
    const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    return type === "module" && src ? [src] : [];
  });
  if (modules.length !== 1 || !/^\/assets\/index-[\w-]+\.js$/.test(modules[0]))
    throw Error(
      "Production index.html must reference exactly one local main module in /assets.",
    );
  return modules[0];
}

export async function readPreviewArtifact(distDirectory) {
  const modulePath = mainModulePath(
    await readFile(resolve(distDirectory, "index.html"), "utf8"),
  );
  const body = await readFile(resolve(distDirectory, `.${modulePath}`));
  return {
    modulePath,
    entry: modulePath.split("/").at(-1),
    bytes: body.length,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

export async function assertPreviewPortAvailable(port, host = "127.0.0.1") {
  await new Promise((resolveReady, reject) => {
    const server = createServer();
    server.once("error", (error) =>
      reject(
        Error(`Preview port ${host}:${port} is unavailable: ${error.message}`),
      ),
    );
    server.listen(port, host, () =>
      server.close((error) => (error ? reject(error) : resolveReady())),
    );
  });
}

export async function waitForPreviewArtifact(
  url,
  expected,
  { timeoutMs = 30000, pollMs = 100, child } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const checkChild = () => {
    if (child?.previewSpawnError) throw child.previewSpawnError;
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw Error(
        `Preview exited before readiness (exit ${child.exitCode}, signal ${child.signalCode}).`,
      );
  };
  while (Date.now() < deadline) {
    checkChild();
    let html;
    try {
      html = await fetch(url, {
        signal: AbortSignal.timeout(
          Math.min(1000, Math.max(1, deadline - Date.now())),
        ),
        redirect: "error",
      });
    } catch {
      checkChild();
      await delay(pollMs);
      continue;
    }
    if (html.status !== 200)
      throw Error(`Preview HTML returned HTTP ${html.status}.`);
    const modulePath = mainModulePath(await html.text());
    if (modulePath !== expected.modulePath)
      throw Error(
        `Preview serves the wrong main module: ${modulePath}, expected ${expected.modulePath}.`,
      );
    const response = await fetch(new URL(modulePath, url), {
      signal: AbortSignal.timeout(1000),
      redirect: "error",
    });
    if (response.status !== 200)
      throw Error(`Preview module returned HTTP ${response.status}.`);
    const body = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (sha256 !== expected.sha256 || body.length !== expected.bytes)
      throw Error(
        `Preview serves wrong main-module bytes: SHA-256 ${sha256}, expected ${expected.sha256}.`,
      );
    checkChild();
    return {
      url: response.url,
      status: response.status,
      bytes: body.length,
      sha256,
      checkedAt: new Date().toISOString(),
    };
  }
  throw Error(`Preview readiness timed out after ${timeoutMs}ms at ${url}.`);
}

export async function startTestPreview({
  port = 5178,
  distDirectory = "dist",
  outputDirectory = "output/test-preview",
  timeoutMs = 30000,
  githubEnvFile = process.env.GITHUB_ENV,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Preview port must be an integer from 1 to 65535.");
  const artifact = await readPreviewArtifact(distDirectory);
  await assertPreviewPortAvailable(port);
  await mkdir(outputDirectory, { recursive: true });
  const log = await open(resolve(outputDirectory, "server.log"), "a");
  const vite = fileURLToPath(
    new URL("../node_modules/vite/bin/vite.js", import.meta.url),
  );
  const child = spawn(
    process.execPath,
    [
      vite,
      "preview",
      "--host",
      "127.0.0.1",
      "--strictPort",
      "--port",
      String(port),
      "--outDir",
      resolve(distDirectory),
    ],
    { detached: true, stdio: ["ignore", log.fd, log.fd] },
  );
  await log.close();
  child.on("error", (error) => {
    child.previewSpawnError = error;
  });
  const url = `http://127.0.0.1:${port}`;
  try {
    const witness = await waitForPreviewArtifact(url, artifact, {
      timeoutMs,
      child,
    });
    const result = { pid: child.pid, url, artifact, witness };
    await writeFile(
      resolve(outputDirectory, "ready.json"),
      JSON.stringify(result, null, 2),
    );
    if (githubEnvFile)
      await appendFile(
        githubEnvFile,
        `GAME_URL=${url}\nEXPECTED_ENTRY=${artifact.entry}\nEXPECTED_ENTRY_SHA256=${artifact.sha256}\n`,
      );
    child.unref();
    return result;
  } catch (error) {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length && args[0] !== "--port"))
    throw Error("Usage: node scripts/test-preview.mjs [--port 5178]");
  const result = await startTestPreview({
    port: args.length ? Number(args[1]) : 5178,
  });
  console.log(
    `Production preview ready at ${result.url}; ${result.artifact.entry} SHA-256 ${result.witness.sha256}`,
  );
}
