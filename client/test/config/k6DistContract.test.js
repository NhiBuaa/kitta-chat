import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  RuntimeConfigValidationError,
  parseRuntimeConfigDocument,
} from "../../src/config/runtimeConfig.js";

const distUrl = new URL("../../dist/", import.meta.url);

const listArtifactFiles = async (directoryUrl) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl);
    return entry.isDirectory() ? listArtifactFiles(entryUrl) : [entryUrl];
  }));
  return files.flat();
};

test("K6 production artifact remains same-origin and excludes D2-only bindings", async () => {
  const index = await readFile(new URL("index.html", distUrl), "utf8");
  const runtime = JSON.parse(
    await readFile(new URL("runtime-config.json", distUrl), "utf8"),
  );
  const artifactFiles = await listArtifactFiles(distUrl);
  const artifactBytes = await Promise.all(artifactFiles.map((url) => readFile(url)));

  assert.match(index, /(?:src|href)="\/assets\//);
  assert.ok(artifactFiles.some((url) => url.pathname.endsWith("/index.html")));
  assert.ok(artifactFiles.some((url) => url.pathname.endsWith("/runtime-config.json")));
  assert.throws(
    () => parseRuntimeConfigDocument(runtime),
    (error) => error instanceof RuntimeConfigValidationError
      && error.issues.includes("capabilities violate the public-demo runtime policy"),
  );

  for (const forbidden of [
    "URL_FRONTEND",
    "CORS_ALLOWED_ORIGINS",
    "BACKEND_UPSTREAM",
    ".railway.app",
    ".railway.internal",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "ghcr.io/nhibuaa",
    "K6_FORBIDDEN_VITE_SENTINEL_111",
  ]) {
    const forbiddenBytes = Buffer.from(forbidden);
    assert.equal(
      artifactBytes.some((artifact) => artifact.includes(forbiddenBytes)),
      false,
      forbidden,
    );
  }
});
