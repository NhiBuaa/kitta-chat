const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const validatorPath = path.resolve(__dirname, 'validateCiContract.cjs');
const licenseCheckCommand =
  'license-checker-rseidelsohn --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD" --summary';
const validWorkflowHeader =
  "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\npermissions:\n  contents: read\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n";
const validSharedSetup =
  "name: Setup Node environment\ninputs:\n  working-directory:\n    required: true\n  cache-dependency-path:\n    required: true\nruns:\n  using: composite\n  steps:\n    - uses: actions/setup-node@1111111111111111111111111111111111111111\n      with:\n        node-version-file: .nvmrc\n        cache: npm\n        cache-dependency-path: ${{ inputs.cache-dependency-path }}\n    - run: node --version\n      shell: bash\n    - run: npm ci\n      shell: bash\n      working-directory: ${{ inputs.working-directory }}\n";
const validTestsWorkflow = `${validWorkflowHeader}jobs:\n  server-tests:\n    name: Server Tests\n    defaults:\n      run:\n        working-directory: server\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: server\n          cache-dependency-path: server/package-lock.json\n      - run: npm test\n  client-tests:\n    name: Client Tests\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm test\n`;
const validBuildWorkflow = `${validWorkflowHeader}jobs:\n  client-build:\n    name: Client Build\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm run build\n`;
const validQualityWorkflow = `${validWorkflowHeader}jobs:\n  client-lint:\n    name: Client Lint\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm run lint:ci\n`;
const validRootAuditJob =
  '  root-audit:\n    name: Dependency Audit (root)\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: .\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: .\n          cache-dependency-path: package-lock.json\n      - run: npm audit --audit-level=high\n';
const validClientAuditJob =
  '  client-audit:\n    name: Dependency Audit (client)\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm audit --audit-level=high\n';
const validServerAuditJob =
  '  server-audit:\n    name: Dependency Audit (server)\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: server\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: server\n          cache-dependency-path: server/package-lock.json\n      - run: npm audit --audit-level=high\n';
const validRootLicenseJob =
  '  root-license-scan:\n    name: License Scan (root)\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: .\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: .\n          cache-dependency-path: package-lock.json\n      - run: npm run license:check\n';
const validClientLicenseJob =
  '  client-license-scan:\n    name: License Scan (client)\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: client\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: client\n          cache-dependency-path: client/package-lock.json\n      - run: npm run license:check\n';
const validServerLicenseJob =
  '  server-license-scan:\n    name: License Scan (server)\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: server\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n      - uses: ./.github/actions/setup-node-env\n        with:\n          working-directory: server\n          cache-dependency-path: server/package-lock.json\n      - run: npm run license:check\n';
const validCodeqlJob =
  '  codeql-analysis:\n    name: CodeQL Analysis (advisory)\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      actions: read\n      security-events: write\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n      - uses: github/codeql-action/init@5555555555555555555555555555555555555555 # v4\n        with:\n          languages: javascript-typescript\n          build-mode: none\n      - uses: github/codeql-action/analyze@5555555555555555555555555555555555555555 # v4\n        with:\n          upload: ${{ github.event_name == \'pull_request\' && github.event.pull_request.head.repo.full_name != github.repository && \'never\' || \'always\' }}\n';
const validSecretScanJob =
  '  secret-scan:\n    name: Secret Scan (advisory)\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      security-events: write\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222 # v4.2.2\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@1111111111111111111111111111111111111111 # v4.4.0\n        with:\n          node-version-file: .nvmrc\n      - id: gitleaks\n        run: docker run --rm -v "$PWD:/repo:ro" -v "$PWD:/out" ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git /repo --redact=100 --report-format sarif --report-path /out/gitleaks-results.sarif --exit-code 1 --no-banner --no-color --log-level warn\n      - id: sanitize\n        if: ${{ always() }}\n        run: node scripts/ci/sanitizeGitleaksSarif.cjs gitleaks-results.sarif gitleaks-results-sanitized.sarif\n      - if: ${{ always() && steps.sanitize.outcome == \'success\' && (github.event_name != \'pull_request\' || github.event.pull_request.head.repo.full_name == github.repository) }}\n        uses: github/codeql-action/upload-sarif@5555555555555555555555555555555555555555 # v4\n        with:\n          sarif_file: gitleaks-results-sanitized.sarif\n';
const validSecurityWorkflow =
  "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\n  schedule:\n    - cron: '0 3 * * 1'\npermissions:\n  contents: read\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\njobs:\n" +
  validRootAuditJob +
  validClientAuditJob +
  validServerAuditJob +
  validRootLicenseJob +
  validClientLicenseJob +
  validServerLicenseJob +
  validCodeqlJob +
  validSecretScanJob;
const validGitleaksConfig =
  'title = "KittaChat Gitleaks policy"\n\n[extend]\nuseDefault = true\n';
const validDockerWorkflow = `${validWorkflowHeader}jobs:\n  build-server:\n    name: Docker Build (server)\n    runs-on: ubuntu-latest\n    env:\n      BUILDKIT_PROGRESS: plain\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n      - uses: docker/build-push-action@4444444444444444444444444444444444444444\n        with:\n          context: ./server\n          file: ./server/Dockerfile\n          target: prod\n          platforms: linux/amd64\n          push: false\n          load: false\n  build-nginx:\n    name: Docker Build (nginx)\n    runs-on: ubuntu-latest\n    env:\n      BUILDKIT_PROGRESS: plain\n    steps:\n      - uses: actions/checkout@2222222222222222222222222222222222222222\n      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n      - uses: docker/build-push-action@4444444444444444444444444444444444444444\n        with:\n          context: .\n          file: ./nginx/Dockerfile\n          platforms: linux/amd64\n          push: false\n          load: false\n`;
const validServerDockerfile =
  'FROM node:22-alpine AS base\nFROM base AS prod\nRUN node --version\n';
const validNginxDockerfile =
  'FROM node:22-alpine AS frontend-build\nRUN node --version\nFROM nginx:alpine\n';
const validRootDockerignore =
  '*\n' +
  '!client/\n' +
  '!client/**\n' +
  '!nginx/\n' +
  '!nginx/Dockerfile\n' +
  '!nginx/nginx.conf\n' +
  'client/node_modules/\n' +
  'client/.env\n' +
  'client/.env.*\n' +
  'client/dist/\n' +
  'client/.vite/\n' +
  'client/.vite-cache/\n' +
  'client/coverage/\n';
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
    if (contents === undefined) {
      continue;
    }

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
  const qualityBadge =
    '[![Quality](https://github.com/NhiBuaa/kitta-chat/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/quality.yml)';
  const dockerBadge =
    '[![Docker](https://github.com/NhiBuaa/kitta-chat/actions/workflows/docker.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/docker.yml)';
  const securityBadge =
    '[![Security](https://github.com/NhiBuaa/kitta-chat/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/security.yml)';

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
    '.github/workflows/security.yml': validSecurityWorkflow,
    '.gitleaks.toml': validGitleaksConfig,
    '.github/workflows/docker.yml': pinDockerWorkflowActions(
      validDockerWorkflow,
    ),
    'server/Dockerfile': validServerDockerfile,
    'nginx/Dockerfile': validNginxDockerfile,
    '.dockerignore': validRootDockerignore,
    'README.md': `${testsBadge}\n${buildBadge}\n${qualityBadge}\n${dockerBadge}\n${securityBadge}\n\nDependency audit, CodeQL, secret scan and license scan results are Advisory findings, not merge blockers or proof that the repository has no vulnerabilities.\n`,
    'package.json': `${JSON.stringify({ scripts: { 'test:ci': 'node --test scripts/ci/*.test.cjs', 'ci:validate': 'node scripts/ci/validateCiContract.cjs', 'license:check': licenseCheckCommand }, devDependencies: { 'license-checker-rseidelsohn': '4.4.2' } })}\n`,
    'client/package.json': `${JSON.stringify({ scripts: { 'lint:ci': 'eslint . --ignore-pattern .vite-cache/** --max-warnings=13', 'license:check': licenseCheckCommand }, devDependencies: { 'license-checker-rseidelsohn': '4.4.2' } })}\n`,
    'server/package.json': `${JSON.stringify({ scripts: { 'license:check': licenseCheckCommand }, devDependencies: { 'license-checker-rseidelsohn': '4.4.2' } })}\n`,
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

function pinDockerWorkflowActions(workflow) {
  return workflow
    .replaceAll(
      '2222222222222222222222222222222222222222',
      '2222222222222222222222222222222222222222 # v4.2.2',
    )
    .replaceAll(
      '3333333333333333333333333333333333333333',
      '3333333333333333333333333333333333333333 # v3',
    )
    .replaceAll(
      '4444444444444444444444444444444444444444',
      '4444444444444444444444444444444444444444 # v6',
    );
}

function replaceLast(source, search, replacement) {
  const index = source.lastIndexOf(search);

  return index < 0
    ? source
    : `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
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

test('ci contract CLI reports a missing Docker workflow', () => {
  const fixtureRoot = createValidRepositoryFixture();

  try {
    rmSync(path.join(fixtureRoot, '.github/workflows/docker.yml'));
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /missing required workflow: \.github\/workflows\/docker\.yml/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI reports a missing Security workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': undefined,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /missing required workflow: \.github\/workflows\/security\.yml/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Security workflow without the weekly schedule', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      "  schedule:\n    - cron: '0 3 * * 1'\n",
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml must schedule Monday at 03:00 UTC/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects Security without three independent dependency audits', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      validRootAuditJob,
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml must define three dependency audit jobs/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects Security without three independent full-tree license scans', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      validServerLicenseJob,
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml must define three license scan jobs/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a package tree with a widened license allowlist', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'client/package.json': `${JSON.stringify({ scripts: { 'lint:ci': 'eslint . --ignore-pattern .vite-cache/** --max-warnings=13', 'license:check': `${licenseCheckCommand};BlueOak-1.0.0` }, devDependencies: { 'license-checker-rseidelsohn': '4.4.2' } })}\n`,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /client\/package\.json must own the exact license scan policy/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects CodeQL without JavaScript build-mode none', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      '          build-mode: none\n',
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml must define the CodeQL advisory contract/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects CodeQL without a fork-safe SARIF upload guard', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      "        with:\n          upload: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && 'never' || 'always' }}\n",
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml CodeQL upload must skip fork pull requests/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a secret scan without complete redaction', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      ' --redact=100',
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml must define the sanitized secret scan contract/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a README without the truthful Security badge', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'README.md':
      '[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)\n' +
      '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)\n' +
      '[![Quality](https://github.com/NhiBuaa/kitta-chat/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/quality.yml)\n' +
      '[![Docker](https://github.com/NhiBuaa/kitta-chat/actions/workflows/docker.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/docker.yml)\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /README must include the truthful Security badge for main/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a repository without the owned Gitleaks policy', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.gitleaks.toml': undefined,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /repository must include the owned \.gitleaks\.toml policy/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects README wording that overstates Security findings', () => {
  const fixtureRoot = createValidRepositoryFixture();
  const readmePath = path.join(fixtureRoot, 'README.md');
  const readme = require('node:fs').readFileSync(readmePath, 'utf8');

  writeFileSync(
    readmePath,
    readme.replace(
      'Dependency audit, CodeQL, secret scan and license scan results are Advisory findings, not merge blockers or proof that the repository has no vulnerabilities.',
      'Security checks are Required proof that the repository has no vulnerabilities.',
    ),
  );

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /README must describe Security findings as Advisory/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects README workflow badges in the wrong order', () => {
  const fixtureRoot = createValidRepositoryFixture();
  const readmePath = path.join(fixtureRoot, 'README.md');
  const readme = require('node:fs').readFileSync(readmePath, 'utf8');
  const lines = readme.split('\n');

  [lines[0], lines[1]] = [lines[1], lines[0]];
  writeFileSync(readmePath, lines.join('\n'));

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /README workflow badges must use the approved order/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a missing root Docker context allowlist', () => {
  const fixtureRoot = createValidRepositoryFixture();

  try {
    rmSync(path.join(fixtureRoot, '.dockerignore'));
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /root \.dockerignore must isolate the nginx build from host artifacts/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Docker workflow without the server build contract', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/docker.yml': `${validWorkflowHeader}jobs: {}\n`,
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /docker\.yml must define the Docker Build \(server\) contract/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a Docker workflow without the nginx build contract', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/docker.yml': pinDockerWorkflowActions(
      validDockerWorkflow.split('  build-nginx:\n')[0],
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /docker\.yml must define the Docker Build \(nginx\) contract/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects server Docker Node major drift', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'server/Dockerfile': validServerDockerfile.replace(
      'node:22-alpine',
      'node:20-alpine',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /server\/Dockerfile Node major must match canonical \.nvmrc major 22/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects nginx Docker Node major drift', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'nginx/Dockerfile': validNginxDockerfile.replace(
      'node:22-alpine',
      'node:21-alpine',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /nginx\/Dockerfile Node major must match canonical \.nvmrc major 22/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects a server Dockerfile without runtime version logging', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'server/Dockerfile': validServerDockerfile.replace(
      'RUN node --version\n',
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /server\/Dockerfile must log the resolved Node version with RUN node --version/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects server runtime logging outside the prod stage', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'server/Dockerfile':
      'FROM node:22-alpine AS base\n' +
      'FROM base AS dev\n' +
      'RUN node --version\n' +
      'FROM base AS prod\n' +
      'RUN npm ci --only=production\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /server\/Dockerfile must log the resolved Node version with RUN node --version in the prod stage/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects an nginx Dockerfile without runtime version logging', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'nginx/Dockerfile': validNginxDockerfile.replace(
      'RUN node --version\n',
      '',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /nginx\/Dockerfile must log the resolved Node version with RUN node --version/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects nginx runtime logging outside the frontend-build stage', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'nginx/Dockerfile':
      'FROM node:22-alpine AS frontend-build\n' +
      'RUN npm ci\n' +
      'FROM nginx:alpine AS runtime\n' +
      'RUN node --version\n',
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /nginx\/Dockerfile must log the resolved Node version with RUN node --version in the frontend-build stage/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects registry authentication in the Docker workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/docker.yml': pinDockerWorkflowActions(
      validDockerWorkflow.replace(
        '      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n',
        '      - uses: docker/login-action@5555555555555555555555555555555555555555 # v3\n' +
          '      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n',
      ),
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /docker\.yml must not authenticate to a container registry/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects secret consumption in the Docker workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/docker.yml': pinDockerWorkflowActions(
      validDockerWorkflow.replace(
        '          load: false\n',
        '          load: false\n          secrets: npm_token=${{ secrets.NPM_TOKEN }}\n',
      ),
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /docker\.yml must not consume GitHub secrets/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects runtime startup in the Docker workflow', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/docker.yml': pinDockerWorkflowActions(
      validDockerWorkflow.replace(
        '      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n',
        '      - run: docker compose up -d\n' +
          '      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n',
      ),
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /docker\.yml must not start Docker Compose or runtime containers/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects Docker Buildx contract regressions', async (t) => {
  const cases = [
    {
      name: 'server image push enabled',
      mutate: (source) =>
        source.replace('          push: false\n', '          push: true\n'),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'server image load enabled',
      mutate: (source) =>
        source.replace('          load: false\n', '          load: true\n'),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'server platform drift',
      mutate: (source) =>
        source.replace('          platforms: linux/amd64\n', '          platforms: linux/arm64\n'),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'server progress is not plain',
      mutate: (source) =>
        source.replace('      BUILDKIT_PROGRESS: plain\n', '      BUILDKIT_PROGRESS: auto\n'),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'server production target missing',
      mutate: (source) => source.replace('          target: prod\n', ''),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'server context owned by repository root',
      mutate: (source) =>
        source.replace('          context: ./server\n', '          context: .\n'),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'server job builds the development client Dockerfile',
      mutate: (source) =>
        source.replace('          file: ./server/Dockerfile\n', '          file: ./client/Dockerfile\n'),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'server job invokes host-side Node setup',
      mutate: (source) =>
        source.replace(
          '      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n',
          '      - uses: ./.github/actions/setup-node-env\n' +
            '      - uses: docker/setup-buildx-action@3333333333333333333333333333333333333333\n',
        ),
      expected: /Docker Build \(server\) contract/i,
    },
    {
      name: 'nginx job builds the development client Dockerfile',
      mutate: (source) =>
        replaceLast(
          source,
          '          file: ./nginx/Dockerfile\n',
          '          file: ./client/Dockerfile\n',
        ),
      expected: /Docker Build \(nginx\) contract/i,
    },
  ];

  for (const contractCase of cases) {
    await t.test(contractCase.name, () => {
      const fixtureRoot = createValidRepositoryFixture({
        '.github/workflows/docker.yml': pinDockerWorkflowActions(
          contractCase.mutate(validDockerWorkflow),
        ),
      });

      try {
        const result = runValidator(fixtureRoot);
        const output = `${result.stdout}${result.stderr}`;

        assert.equal(result.status, 1);
        assert.match(output, contractCase.expected);
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    });
  }
});

test('ci contract CLI excludes the development client Dockerfile from Node drift scope', () => {
  const fixtureRoot = createValidRepositoryFixture({
    'client/Dockerfile': 'FROM node:18-alpine\n',
  });

  try {
    const result = runValidator(fixtureRoot);

    assert.equal(result.status, 0);
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

test('ci contract CLI rejects additional Security pull request branches', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      '    branches: [main]\n  push:',
      '    branches: [main, develop]\n  push:',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml must target main for pull_request/i);
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

test('ci contract CLI rejects additional Security push branches', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      '  push:\n    branches: [main]\n',
      '  push:\n    branches: [main, develop]\n',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /security\.yml must target main for push/i);
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
      /observability\.yml must not use non-approved write permissions/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI rejects non-approved write permissions in ordinary Security jobs', () => {
  const fixtureRoot = createValidRepositoryFixture({
    '.github/workflows/security.yml': validSecurityWorkflow.replace(
      '  root-audit:\n',
      '  root-audit:\n    permissions:\n      contents: read\n      issues: write\n',
    ),
  });

  try {
    const result = runValidator(fixtureRoot);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(
      output,
      /security\.yml must not use non-approved write permissions/i,
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

test('ci contract CLI reports every validated contract category', () => {
  const fixtureRoot = createValidRepositoryFixture();

  try {
    const result = runValidator(fixtureRoot);

    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /validated: workflows, shared setup, commands, permissions, concurrency, action pins, docker, security, badges/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ci contract CLI reports the Security contract category', () => {
  const fixtureRoot = createValidRepositoryFixture();

  try {
    const result = runValidator(fixtureRoot);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /validated: .*security/i);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
