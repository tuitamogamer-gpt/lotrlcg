import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const sessions = [];
const pages = new WeakSet();
const bodylessStatuses = new Set([301, 302, 303, 304, 307, 308]);
const mainModule = /\/(?:assets\/index-[^/]+\.js|src\/main\.tsx)$/;

export function artifactExpectations(env = process.env) {
  const releaseSha = env.RELEASE_SHA;
  if (releaseSha !== undefined)
    assert.match(
      releaseSha,
      /^[a-f\d]{40}$/i,
      "RELEASE_SHA must be a full 40-character commit label",
    );
  const sha256 = env.EXPECTED_ENTRY_SHA256;
  if (sha256 !== undefined)
    assert.match(
      sha256,
      /^[a-f\d]{64}$/i,
      "EXPECTED_ENTRY_SHA256 must be a 64-character SHA-256",
    );
  if (env.EXPECTED_ENTRY !== undefined)
    assert.match(
      env.EXPECTED_ENTRY,
      /^index-[\w-]+\.js$/,
      "EXPECTED_ENTRY must name the main production module",
    );
  return {
    releaseSha: releaseSha ?? null,
    sha256: sha256?.toLowerCase(),
    entry: env.EXPECTED_ENTRY,
    url: env.GAME_URL,
  };
}

/** Attach before navigation: a DOM script URL alone is not a body witness. */
export function observeBrowserArtifact(page) {
  artifactExpectations();
  if (pages.has(page)) return;
  pages.add(page);
  const session = {
    responses: [],
    bodylessResponses: [],
    errors: [],
    pending: [],
  };
  sessions.push(session);
  page.on("response", (response) => {
    if (!mainModule.test(new URL(response.url()).pathname)) return;
    const status = response.status();
    const observedAt = new Date().toISOString();
    if (status !== 200) {
      if (!bodylessStatuses.has(status)) {
        session.errors.push(
          `Main module ${response.url()} returned HTTP ${status}`,
        );
        return;
      }
      session.bodylessResponses.push({
        url: response.url(),
        status,
        location: response.headers().location ?? null,
        observedAt,
      });
      return;
    }
    session.pending.push(
      (async () => {
        try {
          const body = await response.body();
          session.responses.push({
            url: response.url(),
            status,
            bytes: body.length,
            sha256: createHash("sha256").update(body).digest("hex"),
            observedAt,
          });
        } catch (error) {
          session.errors.push(
            `Cannot read actual main-module HTTP 200 body: ${error}`,
          );
        }
      })(),
    );
  });
  page.on("requestfailed", (request) => {
    if (mainModule.test(new URL(request.url()).pathname))
      session.errors.push(
        `Main module request failed: ${request.url()}: ${request.failure()?.errorText}`,
      );
  });
}

export function validateArtifactEvidence(entries, evidence, env = process.env) {
  const expected = artifactExpectations(env);
  assert.deepEqual(
    evidence.errors,
    [],
    "main-module response evidence has no errors",
  );
  if (expected.sha256) {
    assert.equal(
      entries.size,
      1,
      "one observed main production module is required",
    );
    const actualUrl = [...entries][0];
    const parsed = new URL(actualUrl);
    if (expected.url)
      assert.equal(
        parsed.origin,
        new URL(expected.url).origin,
        "main-module witness uses the requested origin",
      );
    if (expected.entry)
      assert.equal(
        parsed.pathname,
        `/assets/${expected.entry}`,
        "main-module witness uses the requested entry",
      );
    const bodies = evidence.responses.filter(
      (row) => row.url === actualUrl && row.status === 200,
    );
    assert.ok(
      bodies.length,
      "expected SHA requires an actual successful HTTP 200 main-module body",
    );
    for (const body of bodies) {
      assert.ok(body.bytes > 0, "actual main-module body is not empty");
      assert.equal(
        body.sha256,
        expected.sha256,
        "actual main-module body matches EXPECTED_ENTRY_SHA256",
      );
    }
    for (const response of evidence.bodylessResponses) {
      assert.equal(
        response.url,
        actualUrl,
        "bodyless main-module response retains the requested URL",
      );
      assert.ok(bodylessStatuses.has(response.status));
      if (response.location)
        assert.equal(
          new URL(response.location, response.url).href,
          actualUrl,
          "bodyless redirect retains the requested main module",
        );
    }
  }
  return {
    ...evidence,
    expectedEntrySha256: expected.sha256 ?? null,
    releaseShaLabel: expected.releaseSha,
    releaseShaVerification:
      "caller-label-only; module byte witnesses do not attest a remote Git commit",
  };
}

export async function collectBrowserArtifactEvidence(
  entries,
  env = process.env,
) {
  return validateArtifactEvidence(
    entries,
    await observedArtifactEvidence(),
    env,
  );
}

async function observedArtifactEvidence() {
  await Promise.all(sessions.flatMap((session) => session.pending));
  return {
    responses: sessions.flatMap((session) => session.responses),
    bodylessResponses: sessions.flatMap((session) => session.bodylessResponses),
    errors: sessions.flatMap((session) => session.errors),
  };
}

// Several maintained suites have custom result schemas. Enforce the supplied
// checksum for those callers too, after they close their real browser, and
// retain a separate response witness without changing their checkpoint counts.
process.once("beforeExit", async () => {
  if (!sessions.length || process.env.EXPECTED_ENTRY_SHA256 === undefined)
    return;
  const evidence = await observedArtifactEvidence();
  const entries = new Set(evidence.responses.map((row) => row.url));
  const directory = "output/browser-artifacts";
  const path = `${directory}/${basename(process.argv[1] ?? "browser")}.json`;
  try {
    const artifactEvidence = validateArtifactEvidence(entries, evidence);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        {
          status: "passed",
          checkedAt: new Date().toISOString(),
          entries: [...entries],
          artifactEvidence,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await mkdir(directory, { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        {
          status: "failed",
          checkedAt: new Date().toISOString(),
          entries: [...entries],
          observedEvidence: evidence,
          validationError: String(error),
        },
        null,
        2,
      ),
    );
    console.error(`Browser artifact verification failed: ${error}`);
    process.exitCode = 1;
  }
});
