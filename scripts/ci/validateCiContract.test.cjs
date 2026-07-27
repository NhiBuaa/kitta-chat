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
const validQualityWorkflow = `${validWorkflowHeader}jobs:\n  client-lint:\n    name: Client Lint\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm run lint:ci\n`;
const validCiPolicySupportWorkflow =
  'name: CI Policy v1 Support\n' +
  'on:\n  workflow_call:\n' +
  'permissions:\n  contents: read\n' +
  'jobs:\n  validate-policy:\n    name: Trusted CI Policy v1\n    runs-on: ubuntu-latest\n    steps:\n' +
  '      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n        with:\n          path: candidate\n' +
  '      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n        with:\n          repository: NhiBuaa/kitta-chat\n          ref: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n          path: policy\n' +
  '      - uses: actions/setup-node@1111111111111111111111111111111111111111 # v4.4.0\n        with:\n          node-version-file: policy/.nvmrc\n          cache: npm\n          cache-dependency-path: policy/package-lock.json\n' +
  '      - run: npm ci\n        working-directory: policy\n' +
  '      - run: node policy/scripts/ci/validateCiContract.cjs candidate --require-ci-policy\n' +
  '      - run: npm ci\n        working-directory: candidate\n' +
  '      - run: npm run test:ci\n        working-directory: candidate\n' +
  '      - run: npm run ci:validate\n        working-directory: candidate\n';

function createFixture(files = {}) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'kitta-ci-contract-'));

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(fixtureRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }

  return fixtureRoot;
}

function createValidRepositoryFixture(overrides = {}) {
  const testsBadge =
    '[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)';
  const buildBadge =
    '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)';

  return createFixture({
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
    '.github/workflows/quality.yml': validQualityWorkflow.replace(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    'README.md': `${testsBadge}\n${buildBadge}\n`,
    'package.json':
      '{"scripts":{"test:ci":"node --test scripts/ci/*.test.cjs","ci:validate":"node scripts/ci/validateCiContract.cjs"}}\n',
    'client/package.json':
      '{"scripts":{"lint:ci":"eslint . --ignore-pattern .vite-cache/** --max-warnings=13"}}\n',
    ...overrides,
  });
}

function createPolicyQualityWorkflow() {
  const pinnedQualityWorkflow = validQualityWorkflow.replace(
    '2222222222222222222222222222222222222222',
    '2222222222222222222222222222222222222222 # v4.2.2',
  );

  return (
    `${pinnedQualityWorkflow}  ci-policy-baseline:\n` +
    '    name: Trusted CI Policy v1 Baseline\n' +
    '    uses: NhiBuaa/kitta-chat/.github/workflows/ci-policy-v1.yml@3333333333333333333333333333333333333333 # CI Policy v1\n' +
    '  ci-policy-v1:\n' +
    '    name: CI Policy v1\n' +
    '    needs: ci-policy-baseline\n' +
    '    if: ${{ always() }}\n' +
    '    runs-on: ubuntu-latest\n' +
    '    steps:\n' +
    '      - env:\n' +
    '          POLICY_RESULT: ${{ needs.ci-policy-baseline.result }}\n' +
    '        run: test "$POLICY_RESULT" = "success"\n'
  );
}

function runValidator(fixtureRoot, cliArguments = []) {
  return spawnSync(process.execPath, [validatorPath, ...cliArguments, fixtureRoot], {
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

test('ci contract CLI rejects repository write permissions in an extension workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/observability.yml':
      'name: Observability\non:\n  workflow_dispatch:\npermissions:\n  contents: write\njobs: {}\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /observability\.yml must not use repository write permissions/i,
    );
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

test('ci contract CLI rejects mutable Action refs in an extension workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/observability.yml':
      'name: Observability\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  observe:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n',
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

test('ci contract CLI rejects pull_request_target in an extension workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/observability.yml':
      'name: Observability\non:\n  pull_request_target:\n    branches: [main]\npermissions:\n  contents: read\njobs: {}\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /observability\.yml must not use pull_request_target/i,
    );
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

test('ci contract CLI rejects continue-on-error in an extension workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/observability.yml':
      'name: Observability\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  observe:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo observe\n        continue-on-error: true\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /observability\.yml must not use continue-on-error: true/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects an extension job that reuses a Required check name', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/observability.yml':
      'name: Observability\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  observe:\n    name: Client Lint\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo observe\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /observability\.yml job observe must not reuse Required check name Client Lint/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI allows a safe Advisory extension job', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/observability.yml':
      'name: Observability\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  observe:\n    name: Advisory Observability\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo observe\n',
  });

  try {
    const result = runValidator(fixtureRoot);

    assert.equal(result.status, 0);
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
    '.github/workflows/quality.yml': validQualityWorkflow.replace(
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

test('ci contract CLI rejects a missing client-owned lint readiness command', () => {
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
    '.github/workflows/quality.yml': validQualityWorkflow.replace(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    'README.md': `${testsBadge}\n${buildBadge}\n`,
    'package.json':
      '{"scripts":{"test:ci":"node --test scripts/ci/*.test.cjs","ci:validate":"node scripts/ci/validateCiContract.cjs"}}\n',
    'client/package.json': '{"scripts":{"lint":"eslint ."}}\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /client\/package\.json must own lint:ci with max-warnings 13/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Quality workflow without the Client Lint contract', () => {
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
    '.github/workflows/quality.yml': `${validWorkflowHeader}jobs: {}\n`,
    'README.md': `${testsBadge}\n${buildBadge}\n`,
    'package.json':
      '{"scripts":{"test:ci":"node --test scripts/ci/*.test.cjs","ci:validate":"node scripts/ci/validateCiContract.cjs"}}\n',
    'client/package.json':
      '{"scripts":{"lint:ci":"eslint . --ignore-pattern .vite-cache/** --max-warnings=13"}}\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /quality\.yml must define the Client Lint contract/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract mode rejects a Quality workflow without the policy baseline and exact gate', () => {
  const fixtureRoot = createValidRepositoryFixture();

  try {
    const result = runValidator(fixtureRoot, ['--require-ci-policy']);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /quality\.yml must define the fixed-SHA policy baseline and exact CI Policy v1 gate/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract mode accepts a fixed-SHA baseline with an exact CI Policy v1 gate', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/quality.yml': createPolicyQualityWorkflow(),
    '.github/workflows/ci-policy-v1.yml': validCiPolicySupportWorkflow,
  });

  try {
    const result = runValidator(fixtureRoot, ['--require-ci-policy']);

    assert.equal(result.status, 0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract mode rejects a direct reusable caller without the exact CI Policy v1 gate', () => {
  const pinnedQualityWorkflow = validQualityWorkflow.replace(
    '2222222222222222222222222222222222222222',
    '2222222222222222222222222222222222222222 # v4.2.2',
  );
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/quality.yml':
      `${pinnedQualityWorkflow}  ci-policy-v1:\n` +
      '    name: CI Policy v1\n' +
      '    uses: NhiBuaa/kitta-chat/.github/workflows/ci-policy-v1.yml@3333333333333333333333333333333333333333 # CI Policy v1\n',
    '.github/workflows/ci-policy-v1.yml': validCiPolicySupportWorkflow,
  });

  try {
    const result = runValidator(fixtureRoot, ['--require-ci-policy']);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /quality\.yml must define the fixed-SHA policy baseline and exact CI Policy v1 gate/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract mode rejects a missing CI Policy v1 support workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/quality.yml': createPolicyQualityWorkflow(),
  });

  try {
    const result = runValidator(fixtureRoot, ['--require-ci-policy']);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /missing CI Policy v1 support workflow/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci policy support mode rejects a missing reusable support workflow', () => {
  const fixtureRoot = createValidRepositoryFixture();

  try {
    const result = runValidator(fixtureRoot, ['--require-ci-policy-support']);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /missing CI Policy v1 support workflow/i);
    assert.doesNotMatch(output, /fixed-SHA policy baseline/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract mode rejects candidate policy tests that run before fixed-baseline validation', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/quality.yml': createPolicyQualityWorkflow(),
    '.github/workflows/ci-policy-v1.yml': validCiPolicySupportWorkflow.replace(
      '      - run: node policy/scripts/ci/validateCiContract.cjs candidate --require-ci-policy\n' +
        '      - run: npm ci\n        working-directory: candidate\n' +
        '      - run: npm run test:ci\n        working-directory: candidate\n',
      '      - run: npm ci\n        working-directory: candidate\n' +
        '      - run: npm run test:ci\n        working-directory: candidate\n' +
        '      - run: node policy/scripts/ci/validateCiContract.cjs candidate --require-ci-policy\n',
    ),
  });

  try {
    const result = runValidator(fixtureRoot, ['--require-ci-policy']);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /CI Policy v1 support must validate the fixed baseline before candidate policy tests/i,
    );
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
    '.github/workflows/quality.yml': validQualityWorkflow.replace(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    ),
    'README.md': `${testsBadge}\n${buildBadge}\n`,
    'package.json':
      '{"scripts":{"test:ci":"node --test scripts/ci/*.test.cjs","ci:validate":"node scripts/ci/validateCiContract.cjs"}}\n',
    'client/package.json':
      '{"scripts":{"lint:ci":"eslint . --ignore-pattern .vite-cache/** --max-warnings=13"}}\n',
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
