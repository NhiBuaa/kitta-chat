const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const verifier = path.resolve(__dirname, 'verifySecurityBaseline.cjs');
const baseline = { audits: { client: { counts: { low: 0, moderate: 0, high: 1, critical: 0 }, vulnerabilities: [{ name: 'accepted', severity: 'high' }] } }, gitleaks: [] };

function run(kind, report) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'security-baseline-'));
  try {
    const baselinePath = path.join(directory, 'baseline.json');
    const reportPath = path.join(directory, 'report.json');
    writeFileSync(baselinePath, JSON.stringify(baseline));
    writeFileSync(reportPath, JSON.stringify(report));
    return spawnSync(process.execPath, [verifier, '--baseline', baselinePath, '--kind', kind, '--surface', 'client', '--report', reportPath], { encoding: 'utf8' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('accepts the exact approved audit baseline', () => {
  const result = run('audit', { metadata: { vulnerabilities: baseline.audits.client.counts }, vulnerabilities: { accepted: { severity: 'high' } } });
  assert.equal(result.status, 0, result.stderr);
});

test('fails for a new or severity-drifted audit finding', () => {
  const result = run('audit', { metadata: { vulnerabilities: { low: 0, moderate: 0, high: 2, critical: 0 } }, vulnerabilities: { accepted: { severity: 'high' }, newFinding: { severity: 'high' } } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /audit client drift/);
});

test('fails for a new sanitized Gitleaks finding', () => {
  const result = run('gitleaks', { runs: [{ results: [{ ruleId: 'private-key', locations: [{ physicalLocation: { artifactLocation: { uri: 'new.js' }, region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 2 } } }], partialFingerprints: { commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }] }] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Gitleaks drift/);
});
