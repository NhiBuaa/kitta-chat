const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function packageParts(coordinate) {
  const at = coordinate.lastIndexOf('@');
  return { name: coordinate.slice(0, at), version: coordinate.slice(at + 1) };
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`);
  }
}

function expandFindings(findings) {
  return findings.flatMap((finding) => {
    const packages = finding.packages || [finding.package];
    return packages.map((packageName) => ({ ...finding, package: packageName }));
  });
}

function readScannerReport(reportPath, packageDirectory) {
  if (reportPath) return readJson(reportPath, 'scanner report');

  const command = process.platform === 'win32'
    ? path.join(packageDirectory, 'node_modules', '.bin', 'license-checker-rseidelsohn.cmd')
    : path.join(packageDirectory, 'node_modules', '.bin', 'license-checker-rseidelsohn');
  const result = spawnSync(command, ['--json'], {
    cwd: packageDirectory,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`License scanner failed: ${result.error?.message || result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function reconcile(surface, policy, report) {
  const surfacePolicy = policy.surfaces?.[surface];
  if (!surfacePolicy) throw new Error(`Policy has no ${surface} surface`);
  const expected = expandFindings(surfacePolicy.findings || []);
  const baseline = new Set(policy.baselineAllowedExpressions || []);
  const scannerEntries = Object.entries(report)
    .map(([packageName, value]) => ({ package: packageName, expression: value.licenses }));
  const actual = scannerEntries.filter((entry) => !baseline.has(entry.expression));
  const expectedByPackage = new Map(expected.map((entry) => [entry.package, entry]));
  const scannerByPackage = new Map(scannerEntries.map((entry) => [entry.package, entry]));
  const errors = [];

  for (const entry of actual) {
    const matching = expectedByPackage.get(entry.package);
    if (matching) {
      if (matching.expression !== entry.expression) {
        errors.push(`expression drift: ${entry.package} expected ${matching.expression} but scanner reported ${entry.expression}`);
      }
      continue;
    }
    const sameName = expected.find((candidate) => packageParts(candidate.package).name === packageParts(entry.package).name);
    if (sameName) {
      const expectedParts = packageParts(sameName.package);
      const actualParts = packageParts(entry.package);
      errors.push(`version drift: ${actualParts.name} expected ${expectedParts.version} but scanner reported ${actualParts.version}`);
    } else {
      errors.push(`new license finding: ${entry.package} — ${entry.expression}`);
    }
  }
  for (const entry of expected) {
    const scannerEntry = scannerByPackage.get(entry.package);
    if (scannerEntry && scannerEntry.expression !== entry.expression) {
      errors.push(`expression drift: ${entry.package} expected ${entry.expression} but scanner reported ${scannerEntry.expression}`);
    } else if (!scannerEntry) {
      const sameName = scannerEntries.find((candidate) => packageParts(candidate.package).name === packageParts(entry.package).name);
      if (!sameName) errors.push(`missing policy finding: ${entry.package} — ${entry.expression}`);
    }
  }
  const spark = expected.find((entry) => entry.package === 'spark-md5@3.0.2');
  if (spark && spark.complianceBasis !== 'MIT') errors.push('spark-md5 must retain MIT compliance basis');
  for (const entry of expected.filter((item) => item.reopenTriggerRequired)) {
    if (typeof entry.reopenTrigger !== 'string' || !entry.reopenTrigger) {
      errors.push(`missing reopen trigger: ${entry.package}`);
    }
  }
  return { errors, findingCount: actual.length };
}

try {
  const surface = option('--surface');
  if (!surface) throw new Error('Missing required --surface');
  const policyPath = path.resolve(option('--policy', path.join(__dirname, '..', '..', 'docs', 'security', 'issue-61-license-policy.json')));
  const reportPath = option('--report');
  const packageDirectory = path.resolve(option('--package-dir', process.cwd()));
  if (!existsSync(policyPath)) throw new Error(`Policy file not found: ${policyPath}`);
  const result = reconcile(surface, readJson(policyPath, 'policy'), readScannerReport(reportPath, packageDirectory));
  if (result.errors.length) {
    result.errors.forEach(fail);
  } else {
    process.stdout.write(`license policy reconciled: ${surface} (${result.findingCount} findings)\n`);
  }
} catch (error) {
  fail(error.message);
}
