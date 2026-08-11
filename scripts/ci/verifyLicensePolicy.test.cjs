const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const verifierPath = path.resolve(__dirname, 'verifyLicensePolicy.cjs');

function createFixture(policy, report) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'license-policy-'));
  const policyPath = path.join(fixtureRoot, 'policy.json');
  const reportPath = path.join(fixtureRoot, 'report.json');

  writeFileSync(policyPath, `${JSON.stringify(policy)}\n`);
  writeFileSync(reportPath, `${JSON.stringify(report)}\n`);

  return { fixtureRoot, policyPath, reportPath };
}

function runVerifier(policy, report) {
  const fixture = createFixture(policy, report);

  try {
    return spawnSync(
      process.execPath,
      [
        verifierPath,
        '--surface',
        'client',
        '--policy',
        fixture.policyPath,
        '--report',
        fixture.reportPath,
      ],
      { encoding: 'utf8' },
    );
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

function createPolicy(findings) {
  return {
    schemaVersion: 1,
    baselineAllowedExpressions: ['MIT', 'Apache-2.0'],
    surfaces: {
      client: {
        findings,
      },
    },
  };
}

test('accepts an exact package, expression, metadata, and compliance-basis reconciliation', () => {
  const policy = createPolicy([
    {
      package: 'spark-md5@3.0.2',
      expression: '(WTFPL OR MIT)',
      disposition: 'ACCEPT',
      complianceBasis: 'MIT',
    },
    {
      package: 'client@0.0.0',
      expression: 'UNLICENSED',
      disposition: 'ACCEPT',
      kind: 'project-metadata',
    },
  ]);
  const report = {
    'spark-md5@3.0.2': { licenses: '(WTFPL OR MIT)' },
    'client@0.0.0': { licenses: 'UNLICENSED' },
    'react@19.2.0': { licenses: 'MIT' },
  };

  const result = runVerifier(policy, report);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /license policy reconciled: client \(2 findings\)/i);
});

test('fails when scanner output contains a new non-baseline finding', () => {
  const result = runVerifier(createPolicy([]), {
    'new-package@1.0.0': { licenses: 'MPL-2.0' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /new license finding: new-package@1\.0\.0 — MPL-2\.0/i);
});

test('fails when a policy row is missing from fresh scanner output', () => {
  const result = runVerifier(
    createPolicy([
      {
        package: 'missing-package@1.0.0',
        expression: 'BlueOak-1.0.0',
        disposition: 'ACCEPT',
      },
    ]),
    {},
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing policy finding: missing-package@1\.0\.0 — BlueOak-1\.0\.0/i);
});

test('fails when a package version drifts from the policy row', () => {
  const result = runVerifier(
    createPolicy([
      {
        package: 'spark-md5@3.0.2',
        expression: '(WTFPL OR MIT)',
        disposition: 'ACCEPT',
        complianceBasis: 'MIT',
      },
    ]),
    {
      'spark-md5@3.0.3': { licenses: '(WTFPL OR MIT)' },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /version drift: spark-md5 expected 3\.0\.2 but scanner reported 3\.0\.3/i);
});

test('fails when the exact SPDX expression drifts from the policy row', () => {
  const result = runVerifier(
    createPolicy([
      {
        package: 'spark-md5@3.0.2',
        expression: '(WTFPL OR MIT)',
        disposition: 'ACCEPT',
        complianceBasis: 'MIT',
      },
    ]),
    {
      'spark-md5@3.0.2': { licenses: 'MIT' },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /expression drift: spark-md5@3\.0\.2 expected \(WTFPL OR MIT\) but scanner reported MIT/i);
});
