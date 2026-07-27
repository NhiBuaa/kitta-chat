const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

const REQUIRED_WORKFLOW_PATHS = [
  '.github/workflows/tests.yml',
  '.github/workflows/build.yml',
];
const CONCURRENCY_GROUP = '${{ github.workflow }}-${{ github.ref }}';
const PULL_REQUEST_CANCELLATION = "${{ github.event_name == 'pull_request' }}";
const SHARED_SETUP_PATH = '.github/actions/setup-node-env/action.yml';
const IMMUTABLE_EXTERNAL_ACTION =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;
const README_BADGES = {
  Build:
    '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)',
  Tests:
    '[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)',
};
const PUBLIC_COMMANDS = {
  'ci:validate': 'node scripts/ci/validateCiContract.cjs',
  'test:ci': 'node --test scripts/ci/*.test.cjs',
};
const VALIDATED_CATEGORIES = [
  'workflows',
  'shared setup',
  'commands',
  'permissions',
  'concurrency',
  'action pins',
  'badges',
];

function collectUses(value, references = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectUses(item, references);
    }
    return references;
  }

  if (!value || typeof value !== 'object') {
    return references;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'uses' && typeof child === 'string') {
      references.push(child);
    } else {
      collectUses(child, references);
    }
  }

  return references;
}

function validateExternalActionReferences(document, errors) {
  for (const reference of collectUses(document)) {
    if (
      !reference.startsWith('./') &&
      !reference.startsWith('docker://') &&
      !IMMUTABLE_EXTERNAL_ACTION.test(reference)
    ) {
      errors.push(`Mutable external Action reference: ${reference}`);
    }
  }
}

function validateExternalActionVersionComments(source, sourcePath, errors) {
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*-?\s*uses:\s+([^\s#]+)(?:\s+#\s*(.+))?$/);

    if (!match) {
      continue;
    }

    const [, reference, versionComment] = match;

    if (
      !reference.startsWith('./') &&
      !reference.startsWith('docker://') &&
      IMMUTABLE_EXTERNAL_ACTION.test(reference) &&
      !versionComment?.trim()
    ) {
      errors.push(
        `${sourcePath} external Action pins require adjacent version comments`,
      );
    }
  }
}

function containsTrueSetting(value, settingName) {
  if (Array.isArray(value)) {
    return value.some((item) => containsTrueSetting(item, settingName));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(
    ([key, child]) =>
      (key === settingName && child === true) ||
      containsTrueSetting(child, settingName),
  );
}

function matchesJobContract(job, contract) {
  const steps = job?.steps;

  if (!Array.isArray(steps)) {
    return false;
  }

  const checkoutIndex = steps.findIndex((step) =>
    step?.uses?.startsWith('actions/checkout@'),
  );
  const setupIndex = steps.findIndex(
    (step) =>
      step?.uses === './.github/actions/setup-node-env' &&
      step?.with?.['working-directory'] === contract.workingDirectory &&
      step?.with?.['cache-dependency-path'] === contract.lockfile,
  );
  const commandIndex = steps.findIndex(
    (step) => step?.run?.trim() === contract.command,
  );

  return (
    job?.name === contract.name &&
    job?.defaults?.run?.['working-directory'] === contract.workingDirectory &&
    checkoutIndex >= 0 &&
    checkoutIndex < setupIndex &&
    setupIndex < commandIndex
  );
}

function validateRepository(repositoryRoot) {
  const errors = [];
  const nodeVersionPath = path.join(repositoryRoot, '.nvmrc');

  if (
    !existsSync(nodeVersionPath) ||
    readFileSync(nodeVersionPath, 'utf8').trim() !== '22'
  ) {
    errors.push('Canonical Node source .nvmrc must contain 22');
  }

  const sharedSetupAbsolutePath = path.join(repositoryRoot, SHARED_SETUP_PATH);

  if (!existsSync(sharedSetupAbsolutePath)) {
    errors.push(`Missing shared Node setup action: ${SHARED_SETUP_PATH}`);
  } else {
    const sharedSetupSource = readFileSync(sharedSetupAbsolutePath, 'utf8');
    const sharedSetup = parse(sharedSetupSource);
    validateExternalActionReferences(sharedSetup, errors);
    validateExternalActionVersionComments(
      sharedSetupSource,
      SHARED_SETUP_PATH,
      errors,
    );
    const workingDirectoryRequired =
      sharedSetup?.inputs?.['working-directory']?.required === true;
    const cacheDependencyRequired =
      sharedSetup?.inputs?.['cache-dependency-path']?.required === true;

    if (!workingDirectoryRequired || !cacheDependencyRequired) {
      errors.push(
        'Shared setup must require working-directory and cache-dependency-path inputs',
      );
    }

    const steps = sharedSetup?.runs?.steps;
    const setupNodeStep = Array.isArray(steps)
      ? steps.find((step) => step?.uses?.startsWith('actions/setup-node@'))
      : undefined;
    const versionStep = Array.isArray(steps)
      ? steps.find((step) => step?.run?.trim() === 'node --version')
      : undefined;
    const installStep = Array.isArray(steps)
      ? steps.find((step) => step?.run?.trim() === 'npm ci')
      : undefined;
    const executionContractValid =
      sharedSetup?.runs?.using === 'composite' &&
      setupNodeStep?.with?.['node-version-file'] === '.nvmrc' &&
      setupNodeStep?.with?.cache === 'npm' &&
      setupNodeStep?.with?.['cache-dependency-path'] ===
        '${{ inputs.cache-dependency-path }}' &&
      versionStep?.shell === 'bash' &&
      installStep?.shell === 'bash' &&
      installStep?.['working-directory'] === '${{ inputs.working-directory }}';

    if (!executionContractValid) {
      errors.push('Shared setup execution contract is incomplete');
    }
  }

  for (const workflowPath of REQUIRED_WORKFLOW_PATHS) {
    const absoluteWorkflowPath = path.join(repositoryRoot, workflowPath);

    if (!existsSync(absoluteWorkflowPath)) {
      errors.push(`Missing required workflow: ${workflowPath}`);
      continue;
    }

    const workflowSource = readFileSync(absoluteWorkflowPath, 'utf8');
    const workflow = parse(workflowSource);
    validateExternalActionReferences(workflow, errors);
    validateExternalActionVersionComments(workflowSource, workflowPath, errors);

    if (Object.hasOwn(workflow?.on || {}, 'pull_request_target')) {
      errors.push(`${path.basename(workflowPath)} must not use pull_request_target`);
    }

    if (containsTrueSetting(workflow, 'continue-on-error')) {
      errors.push(`${path.basename(workflowPath)} must not use continue-on-error: true`);
    }
    const pullRequestBranches = workflow?.on?.pull_request?.branches;

    if (!Array.isArray(pullRequestBranches) || !pullRequestBranches.includes('main')) {
      errors.push(`${path.basename(workflowPath)} must target main for pull_request`);
    }

    const pushBranches = workflow?.on?.push?.branches;

    if (!Array.isArray(pushBranches) || !pushBranches.includes('main')) {
      errors.push(`${path.basename(workflowPath)} must target main for push`);
    }

    if (
      workflow?.concurrency?.group !== CONCURRENCY_GROUP ||
      workflow?.concurrency?.['cancel-in-progress'] !== PULL_REQUEST_CANCELLATION
    ) {
      errors.push(
        `${path.basename(workflowPath)} must cancel only superseded pull_request runs`,
      );
    }

    const permissionEntries = Object.entries(workflow?.permissions || {});

    if (
      permissionEntries.length !== 1 ||
      workflow?.permissions?.contents !== 'read'
    ) {
      errors.push(`${path.basename(workflowPath)} must use contents: read only`);
    }

    if (
      workflowPath.endsWith('tests.yml') &&
      !matchesJobContract(workflow?.jobs?.['server-tests'], {
        command: 'npm test',
        lockfile: 'server/package-lock.json',
        name: 'Server Tests',
        workingDirectory: 'server',
      })
    ) {
      errors.push('tests.yml must define the Server Tests contract');
    }

    if (
      workflowPath.endsWith('tests.yml') &&
      !matchesJobContract(workflow?.jobs?.['client-tests'], {
        command: 'npm test',
        lockfile: 'client/package-lock.json',
        name: 'Client Tests',
        workingDirectory: 'client',
      })
    ) {
      errors.push('tests.yml must define the Client Tests contract');
    }

    if (
      workflowPath.endsWith('build.yml') &&
      !matchesJobContract(workflow?.jobs?.['client-build'], {
        command: 'npm run build',
        lockfile: 'client/package-lock.json',
        name: 'Client Build',
        workingDirectory: 'client',
      })
    ) {
      errors.push('build.yml must define the Client Build contract');
    }
  }

  const readmePath = path.join(repositoryRoot, 'README.md');
  const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '';

  for (const [badgeName, badgeContract] of Object.entries(README_BADGES)) {
    if (!readme.includes(badgeContract)) {
      errors.push(`README must include the truthful ${badgeName} badge for main`);
    }
  }

  if (
    /!\[[^\]]*(?:tests|build)[^\]]*\]\([^\n)]*img\.shields\.io\/badge\/[^\n)]*(?:passing|tests?-\d+|build-\d+)/i.test(
      readme,
    )
  ) {
    errors.push('README must not contain hard-coded passing badges');
  }

  const packagePath = path.join(repositoryRoot, 'package.json');
  const packageDocument = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, 'utf8'))
    : {};
  const publicCommandsValid = Object.entries(PUBLIC_COMMANDS).every(
    ([commandName, command]) => packageDocument?.scripts?.[commandName] === command,
  );

  if (!publicCommandsValid) {
    errors.push('package.json must expose test:ci and ci:validate');
  }

  return {
    errors,
    valid: errors.length === 0,
    validatedCategories: VALIDATED_CATEGORIES,
  };
}

function runCli() {
  const repositoryRoot = path.resolve(process.argv[2] || process.cwd());
  const result = validateRepository(repositoryRoot);

  if (!result.valid) {
    for (const error of result.errors) {
      console.error(`CI Contract: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `CI Contract validated: ${result.validatedCategories.join(', ')}`,
  );
}

if (require.main === module) {
  runCli();
}

module.exports = { validateRepository };
