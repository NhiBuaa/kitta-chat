const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function compare(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`${label} drift`);
}

function canonicalAudit(report) {
  const counts = report?.metadata?.vulnerabilities || {};
  return {
    counts: Object.fromEntries(['low', 'moderate', 'high', 'critical'].map((key) => [key, counts[key] || 0])),
    vulnerabilities: Object.entries(report?.vulnerabilities || {})
      .map(([name, finding]) => ({ name, severity: finding.severity }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function canonicalGitleaks(report) {
  return (report?.runs || []).flatMap((run) => run.results || [])
    .map((result) => {
      const region = result.locations[0].physicalLocation.region;
      return {
        ruleId: result.ruleId,
        path: result.locations[0].physicalLocation.artifactLocation.uri,
        startLine: region.startLine,
        endLine: region.endLine,
        startColumn: region.startColumn,
        endColumn: region.endColumn,
        commitSha: result.partialFingerprints.commitSha,
      };
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function readAuditReport(reportPath, packageDirectory) {
  if (reportPath) return readJson(reportPath);
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: packageDirectory,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.error || !result.stdout) {
    throw new Error(`audit scanner failed: ${result.error?.message || result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

try {
  const baseline = readJson(option('--baseline'));
  const kind = option('--kind');
  const surface = option('--surface');
  if (kind === 'audit') {
    const expected = baseline.audits?.[surface];
    if (!expected) throw new Error(`Missing audit baseline for ${surface}`);
    compare(canonicalAudit(readAuditReport(option('--report'), path.resolve(option('--package-dir') || process.cwd()))), expected, `audit ${surface}`);
    process.stdout.write(`security baseline reconciled: audit ${surface}\n`);
  } else if (kind === 'gitleaks') {
    const report = readJson(option('--report'));
    const expected = baseline.gitleaks.map(({ classification, ...finding }) => finding)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    compare(canonicalGitleaks(report), expected, 'Gitleaks');
    process.stdout.write('security baseline reconciled: Gitleaks\n');
  } else {
    throw new Error('Unsupported baseline kind');
  }
} catch (error) {
  fail(error.message);
}
