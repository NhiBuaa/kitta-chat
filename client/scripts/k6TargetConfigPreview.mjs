import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getK6PreviewFixture } from "./k6TargetConfigFixtures.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const clientDirectory = resolve(scriptDirectory, "..");
const distDirectory = resolve(clientDirectory, "dist");

const parseArgs = (argv) => {
  const options = { fixture: null, port: 4173 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--fixture") options.fixture = argv[++index];
    else if (argv[index] === "--port") options.port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.fixture) throw new Error("--fixture is required");
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  return options;
};

const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat().sort();
};

const hashDist = async () => {
  const hash = createHash("sha256");
  for (const path of await listFiles(distDirectory)) {
    hash.update(relative(distDirectory, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
});

const send = (response, statusCode, body = "", headers = {}) => {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
};

const serveStatic = async (pathname, response) => {
  const decoded = decodeURIComponent(pathname);
  const requested = resolve(distDirectory, decoded.replace(/^\/+/, ""));
  const relativePath = relative(distDirectory, requested);
  const insideDist = relativePath === ""
    || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  let path = insideDist ? requested : resolve(distDirectory, "index.html");

  try {
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
  } catch (_error) {
    if (extname(decoded)) return send(response, 404);
    path = resolve(distDirectory, "index.html");
  }

  const body = await readFile(path);
  return send(response, 200, body, {
    "Content-Type": contentTypes[extname(path).toLowerCase()] || "application/octet-stream",
  });
};

const handleRequest = async (request, response, fixture) => {
  const { pathname } = new URL(request.url, "http://127.0.0.1");
  if (pathname === "/runtime-config.json") {
    if (fixture.kind === "missing") return send(response, 404);
    if (fixture.kind === "raw") {
      return send(response, 200, fixture.body, { "Content-Type": "application/json; charset=utf-8" });
    }
    return send(response, 200, JSON.stringify(fixture.document), {
      "Content-Type": "application/json; charset=utf-8",
    });
  }
  if (pathname.startsWith("/api/")) {
    return send(response, 401, JSON.stringify({ success: false }), {
      "Content-Type": "application/json; charset=utf-8",
    });
  }
  if (pathname.startsWith("/socket.io")) return send(response, 404);
  return serveStatic(pathname, response);
};

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
  const fixture = getK6PreviewFixture(options.fixture);
  await stat(resolve(distDirectory, "index.html"));
  const digest = await hashDist();
  const server = createServer((request, response) => {
    handleRequest(request, response, fixture).catch(() => send(response, 500));
  });
  server.listen(options.port, "127.0.0.1", () => {
    console.log(`K6_TARGET_CONFIG_FIXTURE=${options.fixture}`);
    console.log(`DIST_SHA256=${digest}`);
    console.log(`LISTENING=http://127.0.0.1:${options.port}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`K6 preview failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export { hashDist, parseArgs };
