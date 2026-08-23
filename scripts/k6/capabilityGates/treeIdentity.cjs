const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const isRuntimeEnvironmentFile = (name) => name === ".env"
  || (name.startsWith(".env.") && !name.endsWith(".example"));

const walkCandidateFiles = (root) => {
  const files = [];
  const visit = (directory, relativeDirectory = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      if (isRuntimeEnvironmentFile(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(
        relativeDirectory.split(path.sep).join(path.posix.sep),
        entry.name,
      );
      if (entry.isDirectory()) {
        visit(absolute, relative);
      } else if (entry.isFile()) {
        files.push({ absolute, relative });
      } else {
        throw new Error(`unsupported candidate file type: ${relative}`);
      }
    }
  };
  visit(root);
  return files.sort((left, right) => left.relative.localeCompare(right.relative));
};

const git = (args, environment, options = {}) => execFileSync("git", args, {
  encoding: "utf8",
  env: environment,
  stdio: ["ignore", "pipe", "pipe"],
  ...options,
}).trim();

const computeTree = (candidateRoot, coreAutocrlf) => {
  const root = path.resolve(candidateRoot);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "k6-113-tree-"));
  const gitDirectory = path.join(temporary, "objects.git");
  const index = path.join(temporary, "index");
  const environment = {
    ...process.env,
    GIT_DIR: gitDirectory,
    GIT_INDEX_FILE: index,
    GIT_WORK_TREE: root,
  };

  try {
    git(["init", "--bare", "--quiet", gitDirectory], process.env);
    git(["config", "core.autocrlf", coreAutocrlf], environment);
    git(["read-tree", "--empty"], environment);
    const files = walkCandidateFiles(root);
    const pathInput = `${files.map((file) => file.absolute).join("\n")}\n`;
    const blobs = git(
      ["hash-object", "-w", "--stdin-paths"],
      environment,
      { input: pathInput, stdio: ["pipe", "pipe", "pipe"] },
    ).split(/\r?\n/);
    if (blobs.length !== files.length) throw new Error("candidate blob inventory is incomplete");
    const indexInput = `${files.map(
      (file, index) => `100644 ${blobs[index]}\t${file.relative}`,
    ).join("\n")}\n`;
    git(
      ["update-index", "--add", "--index-info"],
      environment,
      { input: indexInput, stdio: ["pipe", "pipe", "pipe"] },
    );
    return git(["write-tree"], environment);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
};

const computeCandidateTree = (candidateRoot) => computeTree(candidateRoot, "false");

const computeCompatibleTree = (candidateRoot, expectedTree) => {
  const exactTree = computeCandidateTree(candidateRoot);
  if (exactTree === expectedTree) return exactTree;
  const normalizedTree = computeTree(candidateRoot, "input");
  if (normalizedTree === expectedTree) return normalizedTree;
  throw new Error("candidate root does not match the expected Git tree");
};

module.exports = { computeCandidateTree, computeCompatibleTree, walkCandidateFiles };
