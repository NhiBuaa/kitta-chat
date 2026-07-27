const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const validatorPath = path.resolve(__dirname, 'validateCiContract.cjs');
const validWorkflowHeader =
  "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\npermissions:\n  contents: read\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n";
const validSharedSetup =
  "name: Setup Node environment\ninputs:\n  working-directory:\n    required: true\n  cache-dependency-path:\n    required: true\nruns:\n  using: composite\n  steps:\n    - uses: actions/setup-node@1111111111111111111111111111111111111111\n      with:\n        node-version-file: .nvmrc\n        cache: npm\n        cache-dependency-path: ${{ inputs.cache-dependency-path }}\n    - run: node --version\n      shell: bash\n    - run: npm ci\n      shell: bash\n      working-directory: ${{ inputs.working-directory }}\n";
const validTestsWorkflow = `${validWorkflowHeader}jobs:\n  server-tests:\n    name: Server Tests\n    defaults:\n      run:\n        working-directory: server\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: server\n          cache-dependency-path: server/package-lock.json\n      - run: npm test\n  client-tests:\n    name: Client Tests\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm test\n`;
const validBuildWorkflow = `${validWorkflowHeader}jobs:\n  client-build:\n    name: Client Build\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm run build\n`;

function createFixture(files = {}) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'kitta-ci-contract-'));

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(fixtureRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }

  return fixtureRoot;
}

function runValidator(fixtureRoot) {
  return spawnSync(process.execPath, [validatorPath, fixtureRoot], {
    encoding: 'utf8',
  });
}

test('ci contract CLI reports a missing Tests workflow', () => {
  const fixtureRoot = createFixture();

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /missing required workflow: \.github\/workflows\/tests\.yml/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI reports a missing Build workflow', () => {
  const fixtureRoot = createFixture({
    '.github/workflows/tests.yml': 'name: Tests\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /missing required workflow: \.github\/workflows\/build\.yml/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Tests workflow without the main pull request filter', () => {
  const fixtureRoot = createFixture({
    '.github/workflows/tests.yml':
      'name: Tests\non:\n  pull_request:\n  push:\n    branches: [main]\n',
    '.github/workflows/build.yml':
      'name: Build\non:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /tests\.yml must target main for pull_request/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Tests workflow without the main push filter', () => {
  const fixtureRoot = createFixture({
    '.github/workflows/tests.yml':
      'name: Tests\non:\n  pull_request:\n    branches: [main]\n  push:\n',
    '.github/workflows/build.yml':
      'name: Build\non:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /tests\.yml must target main for push/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects unconditional cancellation of main push runs', () => {
  const triggerBlock =
    'on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\n';
  const fixtureRoot = createFixture({
    '.github/workflows/tests.yml': `${triggerBlock}concurrency:\n  group: \${{ github.workflow }}-\${{ github.ref }}\n  cancel-in-progress: true\n`,
    '.github/workflows/build.yml': `${triggerBlock}concurrency:\n  group: \${{ github.workflow }}-\${{ github.ref }}\n  cancel-in-progress: \${{ github.event_name == 'pull_request' }}\n`,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /tests\.yml must cancel only superseded pull_request runs/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a repository without the canonical Node 22 source', () => {
  const workflow =
    "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n";
  const fixtureRoot = createFixture({
    '.github/workflows/tests.yml': workflow,
    '.github/workflows/build.yml': workflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /canonical Node source \.nvmrc must contain 22/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI reports a missing shared Node setup action', () => {
  const workflow =
    "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n";
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/workflows/tests.yml': workflow,
    '.github/workflows/build.yml': workflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /missing shared Node setup action/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a shared setup action with incomplete required inputs', () => {
  const workflow =
    "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n";
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml':
      'name: Setup Node environment\ninputs:\n  working-directory:\n    required: true\nruns:\n  using: composite\n  steps: []\n',
    '.github/workflows/tests.yml': workflow,
    '.github/workflows/build.yml': workflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /shared setup must require working-directory and cache-dependency-path inputs/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a shared setup action without the approved execution contract', () => {
  const workflow =
    "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n";
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml':
      'name: Setup Node environment\ninputs:\n  working-directory:\n    required: true\n  cache-dependency-path:\n    required: true\nruns:\n  using: composite\n  steps: []\n',
    '.github/workflows/tests.yml': workflow,
    '.github/workflows/build.yml': workflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /shared setup execution contract is incomplete/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Tests workflow without the Server Tests contract', () => {
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': `${validWorkflowHeader}jobs: {}\n`,
    '.github/workflows/build.yml': `${validWorkflowHeader}jobs: {}\n`,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /tests\.yml must define the Server Tests contract/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Tests workflow without the Client Tests contract', () => {
  const serverJob =
    'jobs:\n  server-tests:\n    name: Server Tests\n    defaults:\n      run:\n        working-directory: server\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: server\n          cache-dependency-path: server/package-lock.json\n      - run: npm test\n';
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': `${validWorkflowHeader}${serverJob}`,
    '.github/workflows/build.yml': `${validWorkflowHeader}jobs: {}\n`,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /tests\.yml must define the Client Tests contract/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Build workflow without the Client Build contract', () => {
  const testsJobs =
    'jobs:\n  server-tests:\n    name: Server Tests\n    defaults:\n      run:\n        working-directory: server\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: server\n          cache-dependency-path: server/package-lock.json\n      - run: npm test\n  client-tests:\n    name: Client Tests\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm test\n';
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': `${validWorkflowHeader}${testsJobs}`,
    '.github/workflows/build.yml': `${validWorkflowHeader}jobs: {}\n`,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /build\.yml must define the Client Build contract/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects repository write permissions in required workflows', () => {
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': validTestsWorkflow.replace(
      'contents: read',
      'contents: write',
    ),
    '.github/workflows/build.yml': validBuildWorkflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /tests\.yml must use contents: read only/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects mutable external Action references', () => {
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': validTestsWorkflow.replace(
      'actions/checkout@2222222222222222222222222222222222222222',
      'actions/checkout@v4',
    ),
    '.github/workflows/build.yml': validBuildWorkflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /mutable external Action reference: actions\/checkout@v4/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects pull_request_target everywhere', () => {
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': validTestsWorkflow.replace(
      '  push:\n',
      '  pull_request_target:\n    branches: [main]\n  push:\n',
    ),
    '.github/workflows/build.yml': validBuildWorkflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /tests\.yml must not use pull_request_target/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects continue-on-error true everywhere', () => {
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': validTestsWorkflow,
    '.github/workflows/build.yml': validBuildWorkflow.replace(
      '      - run: npm run build\n',
      '      - run: npm run build\n        continue-on-error: true\n',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /build\.yml must not use continue-on-error: true/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects immutable Action pins without version comments', () => {
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup,
    '.github/workflows/tests.yml': validTestsWorkflow,
    '.github/workflows/build.yml': validBuildWorkflow,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /external Action pins require adjacent version comments/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a README without the truthful Tests badge', () => {
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup.replace(
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111 # v4.4.0',
    ),
    '.github/workflows/tests.yml': validTestsWorkflow.replaceAll(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    '.github/workflows/build.yml': validBuildWorkflow.replace(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    'README.md':
      '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /README must include the truthful Tests badge for main/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects hard-coded passing badges', () => {
  const testsBadge =
    '[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)';
  const buildBadge =
    '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)';
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup.replace(
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111 # v4.4.0',
    ),
    '.github/workflows/tests.yml': validTestsWorkflow.replaceAll(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    '.github/workflows/build.yml': validBuildWorkflow.replace(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    'README.md': `${testsBadge}\n${buildBadge}\n![Tests passing](https://img.shields.io/badge/tests-passing-brightgreen)\n`,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /README must not contain hard-coded passing badges/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects missing public package commands', () => {
  const testsBadge =
    '[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)';
  const buildBadge =
    '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)';
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup.replace(
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111 # v4.4.0',
    ),
    '.github/workflows/tests.yml': validTestsWorkflow.replaceAll(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    '.github/workflows/build.yml': validBuildWorkflow.replace(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    'README.md': `${testsBadge}\n${buildBadge}\n`,
    'package.json': '{"scripts":{}}\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /package\.json must expose test:ci and ci:validate/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI reports every validated Slice 1 contract category', () => {
  const testsBadge =
    '[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)';
  const buildBadge =
    '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)';
  const fixtureRoot = createFixture({
    '.nvmrc': '22\n',
    '.github/actions/setup-node-env/action.yml': validSharedSetup.replace(
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111 # v4.4.0',
    ),
    '.github/workflows/tests.yml': validTestsWorkflow.replaceAll(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    '.github/workflows/build.yml': validBuildWorkflow.replace(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    'README.md': `${testsBadge}\n${buildBadge}\n`,
    'package.json':
      '{"scripts":{"test:ci":"node --test scripts/ci/*.test.cjs","ci:validate":"node scripts/ci/validateCiContract.cjs"}}\n',
  });

  try {
    const result = runValidator(fixtureRoot);

    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /validated: workflows, shared setup, commands, permissions, concurrency, action pins, badges/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
