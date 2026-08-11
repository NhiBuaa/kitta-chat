const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const nginx = readFileSync(path.join(root, 'nginx', 'nginx.conf'), 'utf8');
const compose = readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');

test('public nginx denies /ops while retaining the backend-only diagnostic route', () => {
  assert.match(nginx, /location = \/ops \{\s*internal;\s*proxy_pass\s+http:\/\/\$backend_upstream;/s);
  const backend = compose.match(/\r?\n  backend:\r?\n([\s\S]*?)(?=\r?\n  #|\r?\nnetworks:)/)?.[1] || '';
  assert.doesNotMatch(backend, /^    ports:/m);
  assert.match(backend, /^    networks:\s*\r?\n      - chat-network/m);
});
