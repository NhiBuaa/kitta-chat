const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  sanitizeGitleaksSarif,
} = require('./sanitizeGitleaksSarif.cjs');
const sanitizerPath = path.resolve(__dirname, 'sanitizeGitleaksSarif.cjs');

test('sanitizer keeps only safe Gitleaks coordinates and commit fingerprints', () => {
  const input = {
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'gitleaks',
            semanticVersion: '8.30.1',
            rules: [
              {
                id: 'gcp-api-key',
                shortDescription: { text: 'unsafe description' },
              },
            ],
          },
        },
        results: [
          {
            message: { text: 'unsafe matched value' },
            ruleId: 'gcp-api-key',
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'client/src/firebase.js' },
                  region: {
                    startLine: 4,
                    startColumn: 12,
                    endLine: 4,
                    endColumn: 51,
                    snippet: { text: 'unsafe source snippet' },
                  },
                },
              },
            ],
            partialFingerprints: {
              commitSha: '1c83ced93884088d5b71220f37b73ce2d05f1a73',
              email: 'unsafe@example.test',
              author: 'unsafe author',
              date: 'unsafe date',
              commitMessage: 'unsafe commit message',
            },
            properties: { tags: ['unsafe tag'] },
          },
        ],
      },
    ],
  };

  assert.deepEqual(sanitizeGitleaksSarif(input), {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Gitleaks Sanitized Results',
            rules: [{ id: 'gcp-api-key' }],
          },
        },
        results: [
          {
            ruleId: 'gcp-api-key',
            message: { text: 'Sanitized Gitleaks finding' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'client/src/firebase.js' },
                  region: {
                    startLine: 4,
                    startColumn: 12,
                    endLine: 4,
                    endColumn: 51,
                  },
                },
              },
            ],
            partialFingerprints: {
              commitSha: '1c83ced93884088d5b71220f37b73ce2d05f1a73',
            },
          },
        ],
      },
    ],
  });
});

test('sanitizer rejects malformed or unsafe SARIF without echoing input', () => {
  const validResult = {
    ruleId: 'generic-api-key',
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'server/src/config/example.js' },
          region: {
            startLine: 1,
            startColumn: 2,
            endLine: 1,
            endColumn: 42,
          },
        },
      },
    ],
    partialFingerprints: {
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  };
  const cases = [
    null,
    {},
    { runs: [{}] },
    { runs: [{ results: [{ ...validResult, ruleId: 'unsafe rule id' }] }] },
    {
      runs: [
        {
          results: [
            {
              ...validResult,
              locations: [
                {
                  physicalLocation: {
                    ...validResult.locations[0].physicalLocation,
                    artifactLocation: { uri: '../outside.js' },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      runs: [
        {
          results: [
            {
              ...validResult,
              locations: [
                {
                  physicalLocation: {
                    ...validResult.locations[0].physicalLocation,
                    region: {
                      ...validResult.locations[0].physicalLocation.region,
                      startLine: 0,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      runs: [
        {
          results: [
            {
              ...validResult,
              partialFingerprints: { commitSha: 'not-a-commit-sha' },
            },
          ],
        },
      ],
    },
  ];

  for (const input of cases) {
    assert.throws(
      () => sanitizeGitleaksSarif(input),
      (error) =>
        error instanceof Error &&
        error.message === 'Invalid Gitleaks SARIF structure',
    );
  }
});

test('sanitizer CLI writes safe JSON without printing SARIF content', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'kitta-sarif-cli-'));
  const inputPath = path.join(fixtureRoot, 'input.sarif');
  const outputPath = path.join(fixtureRoot, 'output.sarif');
  const input = {
    runs: [
      {
        results: [
          {
            ruleId: 'private-key',
            message: { text: 'unsafe matched value' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'nginx/ssl/server.key' },
                  region: {
                    startLine: 1,
                    startColumn: 1,
                    endLine: 1,
                    endColumn: 20,
                  },
                },
              },
            ],
            partialFingerprints: {
              commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              commitMessage: 'unsafe commit message',
            },
          },
        ],
      },
    ],
  };

  writeFileSync(inputPath, JSON.stringify(input));

  try {
    const result = spawnSync(process.execPath, [sanitizerPath, inputPath, outputPath], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(existsSync(outputPath), true);

    const output = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(output.runs[0].results[0].ruleId, 'private-key');
    assert.equal(
      output.runs[0].results[0].message.text,
      'Sanitized Gitleaks finding',
    );
    assert.deepEqual(output.runs[0].results[0].partialFingerprints, {
      commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    assert.equal(JSON.stringify(output).includes('unsafe'), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('sanitizer CLI fails closed without echoing invalid input', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'kitta-sarif-cli-error-'));
  const inputPath = path.join(fixtureRoot, 'invalid.sarif');
  const outputPath = path.join(fixtureRoot, 'output.sarif');

  writeFileSync(inputPath, '{"unsafe":"TOP_SECRET_MARKER"');

  try {
    for (const args of [[inputPath, outputPath], []]) {
      const result = spawnSync(process.execPath, [sanitizerPath, ...args], {
        encoding: 'utf8',
      });

      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr.trim(), 'SARIF sanitizer failed: invalid input');
      assert.equal(result.stderr.includes('TOP_SECRET_MARKER'), false);
      assert.equal(existsSync(outputPath), false);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
