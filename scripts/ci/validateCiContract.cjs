const { existsSync, readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

const REQUIRED_WORKFLOW_PATHS = [
  '.github/workflows/tests.yml',
  '.github/workflows/build.yml',
  '.github/workflows/quality.yml',
];
const CONCURRENCY_GROUP = '${{ github.workflow }}-${{ github.ref }}';
const PULL_REQUEST_CANCELLATION = "${{ github.event_name == 'pull_request' }}";
const SHARED_SETUP_PATH = '.github/actions/setup-node-env/action.yml';
const IMMUTABLE_EXTERNAL_ACTION =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^@\s]+)?@[0-9a-f]{40}$/;
const CI_POLICY_WORKFLOW_REFERENCE =
  'NhiBuaa/kitta-chat/.github/workflows/ci-policy-v1.yml@';
const CI_POLICY_SUPPORT_PATH = '.github/workflows/ci-policy-v1.yml';
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
const CLIENT_LINT_COMMAND =
  'eslint . --ignore-pattern .vite-cache/** --max-warnings=13';
const REQUIRED_CHECK_LOCATIONS = new Map([
  ['Server Tests', '.github/workflows/tests.yml#server-tests'],
  ['Client Tests', '.github/workflows/tests.yml#client-tests'],
  ['Client Build', '.github/workflows/build.yml#client-build'],
  ['Client Lint', '.github/workflows/quality.yml#client-lint'],
  ['Docker Build (server)', '.github/workflows/docker.yml#build-server'],
  ['Docker Build (nginx)', '.github/workflows/docker.yml#build-nginx'],
  ['CI Policy v1', '.github/workflows/quality.yml#ci-policy-v1'],
]);
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

function containsRepositoryWritePermissions(value) {
  if (Array.isArray(value)) {
    return value.some(containsRepositoryWritePermissions);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([key, child]) => {
    if (
      key === 'permissions' &&
      (child === 'write-all' || child?.contents === 'write')
    ) {
      return true;
    }

    return containsRepositoryWritePermissions(child);
  });
}

function listWorkflowPaths(repositoryRoot) {
  const workflowDirectory = path.join(repositoryRoot, '.github/workflows');

  if (!existsSync(workflowDirectory)) {
    return [];
  }

  return readdirSync(workflowDirectory)
    .filter((fileName) => /\.ya?ml$/i.test(fileName))
    .map((fileName) => `.github/workflows/${fileName}`);
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

function matchesCiPolicyBaselineCaller(job) {
  return (
    job?.name === 'Trusted CI Policy v1 Baseline' &&
    typeof job?.uses === 'string' &&
    job.uses.startsWith(CI_POLICY_WORKFLOW_REFERENCE) &&
    IMMUTABLE_EXTERNAL_ACTION.test(job.uses) &&
    !Object.hasOwn(job, 'with')
  );
}

function matchesCiPolicyGate(job) {
  const enforcementStep = Array.isArray(job?.steps)
    ? job.steps.find(
        (step) =>
          step?.env?.POLICY_RESULT ===
            '${{ needs.ci-policy-baseline.result }}' &&
          step?.run?.trim() === 'test "$POLICY_RESULT" = "success"',
      )
    : undefined;

  return (
    job?.name === 'CI Policy v1' &&
    job?.needs === 'ci-policy-baseline' &&
    job?.if === '${{ always() }}' &&
    job?.['runs-on'] === 'ubuntu-latest' &&
    enforcementStep !== undefined
  );
}

function matchesCiPolicySupportWorkflow(workflow) {
  const workflowCall = workflow?.on?.workflow_call;
  const workflowCallHasNoInputs =
    workflowCall == null ||
    (typeof workflowCall === 'object' &&
      !Object.hasOwn(workflowCall, 'inputs') &&
      !Object.hasOwn(workflowCall, 'secrets'));
  const permissionEntries = Object.entries(workflow?.permissions || {});
  const job = workflow?.jobs?.['validate-policy'];
  const steps = job?.steps;

  if (
    !Object.hasOwn(workflow?.on || {}, 'workflow_call') ||
    !workflowCallHasNoInputs ||
    permissionEntries.length !== 1 ||
    workflow?.permissions?.contents !== 'read' ||
    job?.name !== 'Trusted CI Policy v1' ||
    job?.['runs-on'] !== 'ubuntu-latest' ||
    !Array.isArray(steps)
  ) {
    return false;
  }

  const candidateCheckoutIndex = steps.findIndex(
    (step) =>
      step?.uses?.startsWith('actions/checkout@') &&
      step?.with?.path === 'candidate' &&
      !Object.hasOwn(step.with, 'repository') &&
      !Object.hasOwn(step.with, 'ref'),
  );
  const baselineCheckoutIndex = steps.findIndex(
    (step) =>
      step?.uses?.startsWith('actions/checkout@') &&
      step?.with?.repository === 'NhiBuaa/kitta-chat' &&
      /^[0-9a-f]{40}$/.test(step?.with?.ref) &&
      step?.with?.path === 'policy',
  );
  const setupIndex = steps.findIndex(
    (step) =>
      step?.uses?.startsWith('actions/setup-node@') &&
      step?.with?.['node-version-file'] === 'policy/.nvmrc' &&
      step?.with?.cache === 'npm' &&
      step?.with?.['cache-dependency-path'] === 'policy/package-lock.json',
  );
  const policyInstallIndex = steps.findIndex(
    (step) =>
      step?.run?.trim() === 'npm ci' &&
      step?.['working-directory'] === 'policy',
  );
  const baselineValidationIndex = steps.findIndex(
    (step) =>
      step?.run?.trim() ===
      'node policy/scripts/ci/validateCiContract.cjs candidate --require-ci-policy',
  );
  const candidateInstallIndex = steps.findIndex(
    (step) =>
      step?.run?.trim() === 'npm ci' &&
      step?.['working-directory'] === 'candidate',
  );
  const candidateTestIndex = steps.findIndex(
    (step) =>
      step?.run?.trim() === 'npm run test:ci' &&
      step?.['working-directory'] === 'candidate',
  );
  const candidateValidationIndex = steps.findIndex(
    (step) =>
      step?.run?.trim() === 'npm run ci:validate' &&
      step?.['working-directory'] === 'candidate',
  );

  return (
    candidateCheckoutIndex >= 0 &&
    candidateCheckoutIndex < baselineCheckoutIndex &&
    baselineCheckoutIndex < setupIndex &&
    setupIndex < policyInstallIndex &&
    policyInstallIndex < baselineValidationIndex &&
    baselineValidationIndex < candidateInstallIndex &&
    candidateInstallIndex < candidateTestIndex &&
    candidateTestIndex < candidateValidationIndex
  );
}

function validateRepository(repositoryRoot, options = {}) {
  const errors = [];
  const nodeVersionPath = path.join(repositoryRoot, '.nvmrc');
  const requireCiPolicySupport =
    options.requireCiPolicy === true || options.requireCiPolicySupport === true;

  if (
    requireCiPolicySupport &&
    !existsSync(path.join(repositoryRoot, CI_POLICY_SUPPORT_PATH))
  ) {
    errors.push('Missing CI Policy v1 support workflow');
  } else if (requireCiPolicySupport) {
    const supportWorkflow = parse(
      readFileSync(path.join(repositoryRoot, CI_POLICY_SUPPORT_PATH), 'utf8'),
    );

    if (!matchesCiPolicySupportWorkflow(supportWorkflow)) {
      errors.push(
        'CI Policy v1 support must validate the fixed baseline before candidate policy tests',
      );
    }
  }

  for (const workflowPath of listWorkflowPaths(repositoryRoot)) {
    const workflowSource = readFileSync(
      path.join(repositoryRoot, workflowPath),
      'utf8',
    );
    const workflow = parse(workflowSource);
    validateExternalActionReferences(workflow, errors);
    validateExternalActionVersionComments(workflowSource, workflowPath, errors);

    if (Object.hasOwn(workflow?.on || {}, 'pull_request_target')) {
      errors.push(
        `${path.basename(workflowPath)} must not use pull_request_target`,
      );
    }

    if (containsTrueSetting(workflow, 'continue-on-error')) {
      errors.push(
        `${path.basename(workflowPath)} must not use continue-on-error: true`,
      );
    }

    if (containsRepositoryWritePermissions(workflow)) {
      errors.push(
        `${path.basename(workflowPath)} must not use repository write permissions`,
      );
    }

    for (const [jobId, job] of Object.entries(workflow?.jobs || {})) {
      const approvedLocation = REQUIRED_CHECK_LOCATIONS.get(job?.name);
      const actualLocation = `${workflowPath}#${jobId}`;

      if (approvedLocation && approvedLocation !== actualLocation) {
        errors.push(
          `${path.basename(workflowPath)} job ${jobId} must not reuse Required check name ${job.name}`,
        );
      }
    }
  }

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

    if (
      workflowPath.endsWith('quality.yml') &&
      !matchesJobContract(workflow?.jobs?.['client-lint'], {
        command: 'npm run lint:ci',
        lockfile: 'client/package-lock.json',
        name: 'Client Lint',
        workingDirectory: 'client',
      })
    ) {
      errors.push('quality.yml must define the Client Lint contract');
    }

    if (
      options.requireCiPolicy === true &&
      workflowPath.endsWith('quality.yml') &&
      (!matchesCiPolicyBaselineCaller(
        workflow?.jobs?.['ci-policy-baseline'],
      ) || !matchesCiPolicyGate(workflow?.jobs?.['ci-policy-v1']))
    ) {
      errors.push(
        'quality.yml must define the fixed-SHA policy baseline and exact CI Policy v1 gate',
      );
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

  const clientPackagePath = path.join(repositoryRoot, 'client/package.json');
  const clientPackageDocument = existsSync(clientPackagePath)
    ? JSON.parse(readFileSync(clientPackagePath, 'utf8'))
    : {};

  if (clientPackageDocument?.scripts?.['lint:ci'] !== CLIENT_LINT_COMMAND) {
    errors.push(
      'client/package.json must own lint:ci with max-warnings 13',
    );
  }

  return {
    errors,
    valid: errors.length === 0,
    validatedCategories: VALIDATED_CATEGORIES,
  };
}

function runCli() {
  const cliArguments = process.argv.slice(2);
  const repositoryArgument = cliArguments.find(
    (argument) => !argument.startsWith('--'),
  );
  const repositoryRoot = path.resolve(repositoryArgument || process.cwd());
  const result = validateRepository(repositoryRoot, {
    requireCiPolicy: cliArguments.includes('--require-ci-policy'),
    requireCiPolicySupport: cliArguments.includes(
      '--require-ci-policy-support',
    ),
  });

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
