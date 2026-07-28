const { readFileSync, writeFileSync } = require('node:fs');

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const MAX_COORDINATE = 10_000_000;

function isSafeCoordinate(value) {
  return (
    Number.isInteger(value) && value > 0 && value <= MAX_COORDINATE
  );
}

function isSafeArtifactUri(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('://') &&
    !value.split('/').includes('..') &&
    /^[A-Za-z0-9._@+~%/-]+$/.test(value)
  );
}

function isSafeResult(result) {
  const physicalLocation = result?.locations?.[0]?.physicalLocation;
  const region = physicalLocation?.region;

  return (
    typeof result === 'object' &&
    result !== null &&
    typeof result.ruleId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(result.ruleId) &&
    Array.isArray(result.locations) &&
    result.locations.length === 1 &&
    isSafeArtifactUri(physicalLocation?.artifactLocation?.uri) &&
    isSafeCoordinate(region?.startLine) &&
    isSafeCoordinate(region?.startColumn) &&
    isSafeCoordinate(region?.endLine) &&
    isSafeCoordinate(region?.endColumn) &&
    (region.endLine > region.startLine ||
      (region.endLine === region.startLine &&
        region.endColumn >= region.startColumn)) &&
    typeof result.partialFingerprints?.commitSha === 'string' &&
    /^[0-9a-f]{40}$/i.test(result.partialFingerprints.commitSha)
  );
}

function assertSafeInput(input) {
  const valid =
    typeof input === 'object' &&
    input !== null &&
    Array.isArray(input.runs) &&
    input.runs.length > 0 &&
    input.runs.every(
      (run) =>
        typeof run === 'object' &&
        run !== null &&
        Array.isArray(run.results) &&
        run.results.every(isSafeResult),
    );

  if (!valid) {
    throw new Error('Invalid Gitleaks SARIF structure');
  }
}

function sanitizeGitleaksSarif(input) {
  assertSafeInput(input);

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: input.runs.map((run) => {
      const results = run.results.map((result) => {
        const physicalLocation = result.locations[0].physicalLocation;

        return {
          ruleId: result.ruleId,
          message: { text: 'Sanitized Gitleaks finding' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: physicalLocation.artifactLocation.uri,
                },
                region: {
                  startLine: physicalLocation.region.startLine,
                  startColumn: physicalLocation.region.startColumn,
                  endLine: physicalLocation.region.endLine,
                  endColumn: physicalLocation.region.endColumn,
                },
              },
            },
          ],
          partialFingerprints: {
            commitSha: result.partialFingerprints.commitSha,
          },
        };
      });
      const ruleIds = [...new Set(results.map((result) => result.ruleId))];

      return {
        tool: {
          driver: {
            name: 'Gitleaks Sanitized Results',
            rules: ruleIds.map((id) => ({ id })),
          },
        },
        results,
      };
    }),
  };
}

function runCli(args = process.argv.slice(2)) {
  const [inputPath, outputPath] = args;
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  const output = sanitizeGitleaksSarif(input);

  writeFileSync(outputPath, JSON.stringify(output));
}

if (require.main === module) {
  try {
    if (process.argv.length !== 4) {
      throw new Error('invalid arguments');
    }

    runCli();
  } catch {
    process.stderr.write('SARIF sanitizer failed: invalid input\n');
    process.exitCode = 1;
  }
}

module.exports = { runCli, sanitizeGitleaksSarif };
