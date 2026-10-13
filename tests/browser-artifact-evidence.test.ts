import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artifactExpectations,
  observeBrowserArtifact,
  collectBrowserArtifactEvidence,
  validateArtifactEvidence,
} from "../scripts/browser-artifact-evidence.mjs";

const url = "http://127.0.0.1:5178/assets/index-audit.js";
const entries = new Set([url]);
const body = Buffer.from("export const observed = true;");
const sha256 = createHash("sha256").update(body).digest("hex");
const env = {
  GAME_URL: "http://127.0.0.1:5178",
  EXPECTED_ENTRY: "index-audit.js",
  EXPECTED_ENTRY_SHA256: sha256,
  RELEASE_SHA: "a".repeat(40),
};
const evidence = () => ({
  responses: [{ url, status: 200, bytes: body.length, sha256 }],
  bodylessResponses: [],
  errors: [],
});

test("a wrong checksum or origin fails despite a matching DOM filename", () => {
  assert.throws(
    () =>
      validateArtifactEvidence(entries, evidence(), {
        ...env,
        EXPECTED_ENTRY_SHA256: "0".repeat(64),
      }),
    /actual main-module body matches/,
  );
  assert.throws(
    () =>
      validateArtifactEvidence(entries, evidence(), {
        ...env,
        GAME_URL: "https://unrelated.example",
      }),
    /requested origin/,
  );
  assert.throws(
    () =>
      validateArtifactEvidence(entries, { ...evidence(), responses: [] }, env),
    /actual successful HTTP 200/,
  );
});

test("SHA and commit labels must have full syntax, and a commit label is never attested by a body hash", () => {
  assert.throws(
    () => artifactExpectations({ RELEASE_SHA: "short" }),
    /40-character commit label/,
  );
  assert.throws(
    () => artifactExpectations({ EXPECTED_ENTRY_SHA256: "bad" }),
    /64-character SHA-256/,
  );
  const result = validateArtifactEvidence(entries, evidence(), env);
  assert.equal(result.releaseShaLabel, env.RELEASE_SHA);
  assert.match(result.releaseShaVerification, /caller-label-only/);
  assert.match(
    result.releaseShaVerification,
    /do not attest a remote Git commit/,
  );
});

test("bodyless cache responses are retained but cannot replace a successful byte witness", async () => {
  const page = new EventEmitter();
  observeBrowserArtifact(page);
  let forbiddenBodyReads = 0;
  page.emit("response", {
    url: () => url,
    status: () => 304,
    headers: () => ({}),
    body: () => {
      forbiddenBodyReads++;
      throw Error("body unavailable");
    },
  });
  await assert.rejects(
    collectBrowserArtifactEvidence(entries, env),
    /actual successful HTTP 200/,
  );
  page.emit("response", {
    url: () => url,
    status: () => 200,
    headers: () => ({}),
    body: async () => body,
  });
  const result = await collectBrowserArtifactEvidence(entries, env);
  assert.equal(forbiddenBodyReads, 0);
  assert.equal(result.responses[0].sha256, sha256);
  assert.equal(result.bodylessResponses[0].status, 304);
  assert.equal(result.bodylessResponses[0].location, null);
  assert.deepEqual(result.errors, []);
  assert.throws(
    () =>
      validateArtifactEvidence(
        entries,
        {
          ...evidence(),
          bodylessResponses: [
            {
              url,
              status: 302,
              location: "https://unrelated.example/assets/index-audit.js",
            },
          ],
        },
        env,
      ),
    /redirect retains/,
  );
});

test("custom result schemas still enforce the expected bytes before the browser script exits", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lotrlcg-artifact-guard-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const moduleUrl = new URL(
    "../scripts/browser-artifact-evidence.mjs",
    import.meta.url,
  ).href;
  // This is a controlled response API fixture, not a claimed browser witness.
  const script = `import { EventEmitter } from 'node:events';
    import { observeBrowserArtifact } from ${JSON.stringify(moduleUrl)};
    const page = new EventEmitter();
    observeBrowserArtifact(page);
    page.emit('response', {url: () => ${JSON.stringify(url)}, status: () => 200,
      headers: () => ({}), body: async () => Buffer.from(${JSON.stringify(body.toString())})});`;
  for (const expected of [sha256, "0".repeat(64)]) {
    const environment = {
      ...process.env,
      ...env,
      EXPECTED_ENTRY_SHA256: expected,
    };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      { cwd: directory, env: environment, encoding: "utf8" },
    );
    if (expected === sha256) assert.equal(result.status, 0, result.stderr);
    else {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Browser artifact verification failed/);
    }
  }
});
