const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('server Docker context excludes every local environment file', () => {
  const dockerignore = fs.readFileSync(
    path.join(repositoryRoot, 'server', '.dockerignore'),
    'utf8',
  );
  const rules = dockerignore
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.ok(rules.includes('.env*'));
  assert.equal(rules.some((rule) => rule.startsWith('!.env')), false);
});

test('public-demo edge build clears the legacy default-avatar build input', () => {
  const dockerfile = fs.readFileSync(
    path.join(repositoryRoot, 'nginx', 'Dockerfile'),
    'utf8',
  );

  assert.match(
    dockerfile,
    /ARG VITE_DEFAULT_AVATAR=""[\s\S]*ENV VITE_DEFAULT_AVATAR=\$\{VITE_DEFAULT_AVATAR\}/u,
  );
  assert.equal(
    dockerfile.includes('ENV VITE_DEFAULT_AVATAR="https://'),
    false,
  );
});
