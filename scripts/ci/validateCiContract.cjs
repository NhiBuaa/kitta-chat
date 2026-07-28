const { existsSync, readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

const REQUIRED_WORKFLOW_PATHS = [
  '.github/workflows/tests.yml',
  '.github/workflows/build.yml',
  '.github/workflows/quality.yml',
  '.github/workflows/docker.yml',
  '.github/workflows/security.yml',
];
const CONCURRENCY_GROUP = '${{ github.workflow }}-${{ github.ref }}';
const PULL_REQUEST_CANCELLATION = "${{ github.event_name == 'pull_request' }}";
const SHARED_SETUP_PATH = '.github/actions/setup-node-env/action.yml';
const ROOT_DOCKERIGNORE_PATH = '.dockerignore';
const ROOT_DOCKERIGNORE_CONTRACT = [
  '*',
  '!client/',
  '!client/**',
  '!nginx/',
  '!nginx/Dockerfile',
  '!nginx/nginx.conf',
  'client/node_modules/',
  'client/.env',
  'client/.env.*',
  'client/dist/',
  'client/.vite/',
  'client/.vite-cache/',
  'client/coverage/',
];
const IMMUTABLE_EXTERNAL_ACTION =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^@\s]+)?@[0-9a-f]{40}$/;
const CI_POLICY_WORKFLOW_REFERENCE =
  'NhiBuaa/kitta-chat/.github/workflows/ci-policy-v1.yml@';
const CI_POLICY_SUPPORT_PATH = '.github/workflows/ci-policy-v1.yml';
const README_BADGES = {
  Tests:
    '[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)',
  Build:
    '[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)',
  Quality:
    '[![Quality](https://github.com/NhiBuaa/kitta-chat/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/quality.yml)',
  Docker:
    '[![Docker](https://github.com/NhiBuaa/kitta-chat/actions/workflows/docker.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/docker.yml)',
  Security:
    '[![Security](https://github.com/NhiBuaa/kitta-chat/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/security.yml)',
};
const README_SECURITY_ADVISORY_COPY =
  'Dependency audit, CodeQL, secret scan and license scan results are Advisory findings, not merge blockers or proof that the repository has no vulnerabilities.';
const PUBLIC_COMMANDS = {
  'ci:validate': 'node scripts/ci/validateCiContract.cjs',
  'test:ci': 'node --test scripts/ci/*.test.cjs',
};
const ROOT_LINT_COMMANDS = {
  lint: 'npm --prefix client run lint',
  'lint:ci': 'npm --prefix client run lint:ci',
};
const CLIENT_LINT_COMMAND =
  'eslint . --ignore-pattern .vite-cache/** --max-warnings=13';
const LICENSE_CHECK_COMMAND =
  'license-checker-rseidelsohn --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD" --summary';
const LICENSE_CHECKER_VERSION = '4.4.2';
const GITLEAKS_COMMAND =
  'docker run --rm -v "$PWD:/repo:ro" -v "$PWD:/out" ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git /repo --redact=100 --report-format sarif --report-path /out/gitleaks-results.sarif --exit-code 1 --no-banner --no-color --log-level warn';
const SANITIZE_SARIF_COMMAND =
  'node scripts/ci/sanitizeGitleaksSarif.cjs gitleaks-results.sarif gitleaks-results-sanitized.sarif';
const SARIF_UPLOAD_CONDITION =
  "${{ always() && steps.sanitize.outcome == 'success' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}";
const CODEQL_UPLOAD_CONDITION =
  "${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && 'never' || 'always' }}";
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
  'docker',
  'security',
  'badges',
];
const SLICE_5_LINT_ERROR_RULE =
  /(?:no-unused-vars|react-hooks\/(?:refs|set-state-in-effect))/;

function hasSlice5LintSuppression(repositoryRoot) {
  const sourceRoot = path.join(repositoryRoot, 'client');
  const sourceFiles = [];
  const ignoredDirectories = new Set([
    '.vite-cache',
    'coverage',
    'dist',
    'node_modules',
  ]);

  const collectSourceFiles = (directory) => {
    if (!existsSync(directory)) return;

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) continue;
        collectSourceFiles(entryPath);
      } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        sourceFiles.push(entryPath);
      }
    }
  };

  collectSourceFiles(sourceRoot);

  for (const sourcePath of sourceFiles) {
    const source = readFileSync(sourcePath, 'utf8');
    const directives = source.matchAll(
      /eslint-disable(?:-next-line|-line)?(?:\s+([^\r\n]*))?/g,
    );

    for (const directive of directives) {
      const disabledRules = directive[1]?.trim() || '';
      if (!disabledRules || SLICE_5_LINT_ERROR_RULE.test(disabledRules)) {
        return true;
      }
    }
  }

  const eslintConfigPath = path.join(repositoryRoot, 'client/eslint.config.js');
  if (!existsSync(eslintConfigPath)) return false;

  const eslintConfig = readFileSync(eslintConfigPath, 'utf8');
  return new RegExp(
    `["']?(?:no-unused-vars|react-hooks\\/(?:refs|set-state-in-effect))["']?\\s*:\\s*(?:["'](?:off|warn)["']|[01]\\b)`,
  ).test(eslintConfig);
}

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

function collectRunCommands(value, commands = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRunCommands(item, commands);
    }
    return commands;
  }

  if (!value || typeof value !== 'object') {
    return commands;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'run' && typeof child === 'string') {
      commands.push(child);
    } else {
      collectRunCommands(child, commands);
    }
  }

  return commands;
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

function containsNonApprovedWritePermissions(
  value,
  workflowPath,
  objectPath = [],
) {
  if (Array.isArray(value)) {
    return value.some((item, index) =>
      containsNonApprovedWritePermissions(item, workflowPath, [
        ...objectPath,
        String(index),
      ]),
    );
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([key, child]) => {
    if (key === 'permissions') {
      if (child === 'write-all') {
        return true;
      }

      if (child && typeof child === 'object') {
        const jobId =
          objectPath.length === 2 && objectPath[0] === 'jobs'
            ? objectPath[1]
            : undefined;

        for (const [scope, access] of Object.entries(child)) {
          const approvedSecurityUpload =
            workflowPath.endsWith('security.yml') &&
            scope === 'security-events' &&
            access === 'write' &&
            (jobId === 'codeql-analysis' || jobId === 'secret-scan');

          if (access === 'write' && !approvedSecurityUpload) {
            return true;
          }
        }
      }
    }

    return containsNonApprovedWritePermissions(child, workflowPath, [
      ...objectPath,
      key,
    ]);
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

function matchesDockerBuildContract(job, contract) {
  const steps = job?.steps;

  if (!Array.isArray(steps)) {
    return false;
  }

  const checkoutIndex = steps.findIndex((step) =>
    step?.uses?.startsWith('actions/checkout@'),
  );
  const setupBuildxIndex = steps.findIndex((step) =>
    step?.uses?.startsWith('docker/setup-buildx-action@'),
  );
  const buildIndex = steps.findIndex((step) =>
    step?.uses?.startsWith('docker/build-push-action@'),
  );
  const buildStep = steps[buildIndex];
  const targetMatches = Object.hasOwn(contract, 'target')
    ? buildStep?.with?.target === contract.target
    : !Object.hasOwn(buildStep?.with || {}, 'target');

  return (
    job?.name === contract.name &&
    job?.['runs-on'] === 'ubuntu-latest' &&
    job?.env?.BUILDKIT_PROGRESS === 'plain' &&
    checkoutIndex >= 0 &&
    checkoutIndex < setupBuildxIndex &&
    setupBuildxIndex < buildIndex &&
    buildStep?.with?.context === contract.context &&
    buildStep?.with?.file === contract.file &&
    targetMatches &&
    buildStep?.with?.platforms === 'linux/amd64' &&
    buildStep?.with?.push === false &&
    buildStep?.with?.load === false &&
    !steps.some(
      (step) => step?.uses === './.github/actions/setup-node-env',
    )
  );
}

function matchesCodeqlContract(job) {
  const steps = job?.steps;
  const permissionEntries = Object.entries(job?.permissions || {});

  if (!Array.isArray(steps)) {
    return false;
  }

  const checkoutIndex = steps.findIndex((step) =>
    step?.uses?.startsWith('actions/checkout@'),
  );
  const initIndex = steps.findIndex(
    (step) =>
      step?.uses?.startsWith('github/codeql-action/init@') &&
      step?.with?.languages === 'javascript-typescript' &&
      step?.with?.['build-mode'] === 'none',
  );
  const analyzeIndex = steps.findIndex((step) =>
    step?.uses?.startsWith('github/codeql-action/analyze@'),
  );

  return (
    job?.name === 'CodeQL Analysis (advisory)' &&
    job?.['runs-on'] === 'ubuntu-latest' &&
    permissionEntries.length === 3 &&
    job?.permissions?.contents === 'read' &&
    job?.permissions?.actions === 'read' &&
    job?.permissions?.['security-events'] === 'write' &&
    checkoutIndex >= 0 &&
    checkoutIndex < initIndex &&
    initIndex < analyzeIndex &&
    !steps.some((step) =>
      step?.uses?.startsWith('github/codeql-action/autobuild@'),
    ) &&
    !collectRunCommands(job).some((command) =>
      /(?:npm\s+(?:run\s+)?build|yarn\s+build|pnpm\s+build)/i.test(command),
    )
  );
}

function hasForkSafeCodeqlUpload(job) {
  return job?.steps?.some(
    (step) =>
      step?.uses?.startsWith('github/codeql-action/analyze@') &&
      step?.with?.upload === CODEQL_UPLOAD_CONDITION,
  );
}

function matchesSecretScanContract(job) {
  const steps = job?.steps;
  const permissionEntries = Object.entries(job?.permissions || {});

  if (!Array.isArray(steps)) {
    return false;
  }

  const checkoutIndex = steps.findIndex(
    (step) =>
      step?.uses?.startsWith('actions/checkout@') &&
      step?.with?.['fetch-depth'] === 0,
  );
  const setupIndex = steps.findIndex(
    (step) =>
      step?.uses?.startsWith('actions/setup-node@') &&
      step?.with?.['node-version-file'] === '.nvmrc',
  );
  const scanIndex = steps.findIndex(
    (step) => step?.id === 'gitleaks' && step?.run?.trim() === GITLEAKS_COMMAND,
  );
  const sanitizeIndex = steps.findIndex(
    (step) =>
      step?.id === 'sanitize' &&
      step?.if === '${{ always() }}' &&
      step?.run?.trim() === SANITIZE_SARIF_COMMAND,
  );
  const uploadIndex = steps.findIndex(
    (step) =>
      step?.if === SARIF_UPLOAD_CONDITION &&
      step?.uses?.startsWith('github/codeql-action/upload-sarif@') &&
      step?.with?.sarif_file === 'gitleaks-results-sanitized.sarif',
  );

  return (
    job?.name === 'Secret Scan (advisory)' &&
    job?.['runs-on'] === 'ubuntu-latest' &&
    permissionEntries.length === 2 &&
    job?.permissions?.contents === 'read' &&
    job?.permissions?.['security-events'] === 'write' &&
    checkoutIndex >= 0 &&
    checkoutIndex < setupIndex &&
    setupIndex < scanIndex &&
    scanIndex < sanitizeIndex &&
    sanitizeIndex < uploadIndex &&
    !steps.some((step) => step?.uses === './.github/actions/setup-node-env') &&
    !collectRunCommands(job).some((command) => command.trim() === 'npm ci')
  );
}

function validateDockerfileNodeMajor(
  repositoryRoot,
  dockerfilePath,
  canonicalNodeMajor,
  errors,
) {
  const absolutePath = path.join(repositoryRoot, dockerfilePath);

  if (!existsSync(absolutePath)) {
    errors.push(`Missing in-scope Dockerfile: ${dockerfilePath}`);
    return;
  }

  const source = readFileSync(absolutePath, 'utf8');
  const declaredMajors = Array.from(
    source.matchAll(
      /^\s*FROM(?:\s+--platform=\S+)?\s+node:(\d+)[^\s]*\s*(?:AS\s+\S+)?\s*$/gim,
    ),
    (match) => match[1],
  );

  if (
    declaredMajors.length === 0 ||
    declaredMajors.some((major) => major !== canonicalNodeMajor)
  ) {
    errors.push(
      `${dockerfilePath} Node major must match canonical .nvmrc major ${canonicalNodeMajor}`,
    );
  }
}

function validateDockerfileRuntimeLogging(
  repositoryRoot,
  dockerfilePath,
  expectedStage,
  errors,
) {
  const absolutePath = path.join(repositoryRoot, dockerfilePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const source = readFileSync(absolutePath, 'utf8');
  let currentStage = '';
  let stageLogsRuntimeVersion = false;

  for (const line of source.split(/\r?\n/)) {
    const stageMatch = line.match(
      /^\s*FROM(?:\s+--platform=\S+)?\s+\S+\s+AS\s+(\S+)\s*$/i,
    );

    if (stageMatch) {
      currentStage = stageMatch[1].toLowerCase();
      continue;
    }

    if (
      currentStage === expectedStage.toLowerCase() &&
      /^\s*RUN\s+node\s+--version\s*$/i.test(line)
    ) {
      stageLogsRuntimeVersion = true;
    }
  }

  if (!stageLogsRuntimeVersion) {
    errors.push(
      `${dockerfilePath} must log the resolved Node version with RUN node --version in the ${expectedStage} stage`,
    );
  }
}

function validateRootDockerignore(repositoryRoot, errors) {
  const absolutePath = path.join(repositoryRoot, ROOT_DOCKERIGNORE_PATH);
  const actualContract = existsSync(absolutePath)
    ? readFileSync(absolutePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    : [];

  if (
    JSON.stringify(actualContract) !==
    JSON.stringify(ROOT_DOCKERIGNORE_CONTRACT)
  ) {
    errors.push(
      'Root .dockerignore must isolate the nginx build from host artifacts',
    );
  }
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
  const canonicalNodeMajor = existsSync(nodeVersionPath)
    ? readFileSync(nodeVersionPath, 'utf8').trim()
    : '';
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

    if (
      workflowPath.endsWith('docker.yml') &&
      collectUses(workflow).some((reference) =>
        reference.startsWith('docker/login-action@'),
      )
    ) {
      errors.push('docker.yml must not authenticate to a container registry');
    }

    if (
      workflowPath.endsWith('docker.yml') &&
      /\$\{\{\s*secrets\./i.test(workflowSource)
    ) {
      errors.push('docker.yml must not consume GitHub secrets');
    }

    if (
      workflowPath.endsWith('docker.yml') &&
      collectRunCommands(workflow).some((command) =>
        /(^|\s)docker\s+(?:compose|run)\b/i.test(command),
      )
    ) {
      errors.push(
        'docker.yml must not start Docker Compose or runtime containers',
      );
    }

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

    if (containsNonApprovedWritePermissions(workflow, workflowPath)) {
      errors.push(
        `${path.basename(workflowPath)} must not use non-approved write permissions`,
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
    !existsSync(nodeVersionPath) || canonicalNodeMajor !== '22'
  ) {
    errors.push('Canonical Node source .nvmrc must contain 22');
  }

  validateDockerfileNodeMajor(
    repositoryRoot,
    'server/Dockerfile',
    canonicalNodeMajor,
    errors,
  );
  validateDockerfileNodeMajor(
    repositoryRoot,
    'nginx/Dockerfile',
    canonicalNodeMajor,
    errors,
  );
  validateDockerfileRuntimeLogging(
    repositoryRoot,
    'server/Dockerfile',
    'prod',
    errors,
  );
  validateDockerfileRuntimeLogging(
    repositoryRoot,
    'nginx/Dockerfile',
    'frontend-build',
    errors,
  );
  validateRootDockerignore(repositoryRoot, errors);

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

    if (
      !Array.isArray(pullRequestBranches) ||
      pullRequestBranches.length !== 1 ||
      pullRequestBranches[0] !== 'main'
    ) {
      errors.push(`${path.basename(workflowPath)} must target main for pull_request`);
    }

    const pushBranches = workflow?.on?.push?.branches;

    if (
      !Array.isArray(pushBranches) ||
      pushBranches.length !== 1 ||
      pushBranches[0] !== 'main'
    ) {
      errors.push(`${path.basename(workflowPath)} must target main for push`);
    }

    if (
      workflowPath.endsWith('security.yml') &&
      (workflow?.on?.schedule?.length !== 1 ||
        workflow.on.schedule[0]?.cron !== '0 3 * * 1')
    ) {
      errors.push('security.yml must schedule Monday at 03:00 UTC');
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
      workflowPath.endsWith('security.yml') &&
      ![
        {
          id: 'root-audit',
          lockfile: 'package-lock.json',
          name: 'Dependency Audit (root)',
          workingDirectory: '.',
        },
        {
          id: 'client-audit',
          lockfile: 'client/package-lock.json',
          name: 'Dependency Audit (client)',
          workingDirectory: 'client',
        },
        {
          id: 'server-audit',
          lockfile: 'server/package-lock.json',
          name: 'Dependency Audit (server)',
          workingDirectory: 'server',
        },
      ].every((contract) =>
        matchesJobContract(workflow?.jobs?.[contract.id], {
          command: 'npm audit --audit-level=high',
          lockfile: contract.lockfile,
          name: contract.name,
          workingDirectory: contract.workingDirectory,
        }),
      )
    ) {
      errors.push('security.yml must define three dependency audit jobs');
    }

    if (
      workflowPath.endsWith('security.yml') &&
      ![
        {
          id: 'root-license-scan',
          lockfile: 'package-lock.json',
          name: 'License Scan (root)',
          workingDirectory: '.',
        },
        {
          id: 'client-license-scan',
          lockfile: 'client/package-lock.json',
          name: 'License Scan (client)',
          workingDirectory: 'client',
        },
        {
          id: 'server-license-scan',
          lockfile: 'server/package-lock.json',
          name: 'License Scan (server)',
          workingDirectory: 'server',
        },
      ].every((contract) =>
        matchesJobContract(workflow?.jobs?.[contract.id], {
          command: 'npm run license:check',
          lockfile: contract.lockfile,
          name: contract.name,
          workingDirectory: contract.workingDirectory,
        }),
      )
    ) {
      errors.push('security.yml must define three license scan jobs');
    }

    if (
      workflowPath.endsWith('security.yml') &&
      !matchesCodeqlContract(workflow?.jobs?.['codeql-analysis'])
    ) {
      errors.push('security.yml must define the CodeQL advisory contract');
    }

    if (
      workflowPath.endsWith('security.yml') &&
      !hasForkSafeCodeqlUpload(workflow?.jobs?.['codeql-analysis'])
    ) {
      errors.push('security.yml CodeQL upload must skip fork pull requests');
    }

    if (
      workflowPath.endsWith('security.yml') &&
      !matchesSecretScanContract(workflow?.jobs?.['secret-scan'])
    ) {
      errors.push('security.yml must define the sanitized secret scan contract');
    }

    if (
      workflowPath.endsWith('docker.yml') &&
      !matchesDockerBuildContract(workflow?.jobs?.['build-server'], {
        context: './server',
        file: './server/Dockerfile',
        name: 'Docker Build (server)',
        target: 'prod',
      })
    ) {
      errors.push('docker.yml must define the Docker Build (server) contract');
    }

    if (
      workflowPath.endsWith('docker.yml') &&
      !matchesDockerBuildContract(workflow?.jobs?.['build-nginx'], {
        context: '.',
        file: './nginx/Dockerfile',
        name: 'Docker Build (nginx)',
      })
    ) {
      errors.push('docker.yml must define the Docker Build (nginx) contract');
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

  const badgePositions = Object.values(README_BADGES).map((badge) =>
    readme.indexOf(badge),
  );

  if (
    badgePositions.some((position) => position < 0) ||
    badgePositions.some(
      (position, index) => index > 0 && position <= badgePositions[index - 1],
    )
  ) {
    errors.push('README workflow badges must use the approved order');
  }

  if (!readme.includes(README_SECURITY_ADVISORY_COPY)) {
    errors.push('README must describe Security findings as Advisory');
  }

  const gitleaksConfigPath = path.join(repositoryRoot, '.gitleaks.toml');

  if (!existsSync(gitleaksConfigPath)) {
    errors.push('Repository must include the owned .gitleaks.toml policy');
  } else if (/\bpaths\s*=\s*\[/i.test(readFileSync(gitleaksConfigPath, 'utf8'))) {
    errors.push('.gitleaks.toml must not use broad path exclusions');
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

  const rootLintCommandsValid = Object.entries(ROOT_LINT_COMMANDS).every(
    ([commandName, command]) => packageDocument?.scripts?.[commandName] === command,
  );

  if (!rootLintCommandsValid) {
    errors.push('Root lint commands must delegate to the client-owned commands');
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

  if (hasSlice5LintSuppression(repositoryRoot)) {
    errors.push('Client source and ESLint config must not suppress Slice 5 lint error rules');
  }

  for (const [packagePath, packageConfig] of [
    ['package.json', packageDocument],
    ['client/package.json', clientPackageDocument],
    [
      'server/package.json',
      existsSync(path.join(repositoryRoot, 'server/package.json'))
        ? JSON.parse(
            readFileSync(path.join(repositoryRoot, 'server/package.json'), 'utf8'),
          )
        : {},
    ],
  ]) {
    if (
      packageConfig?.scripts?.['license:check'] !== LICENSE_CHECK_COMMAND ||
      packageConfig?.devDependencies?.['license-checker-rseidelsohn'] !==
        LICENSE_CHECKER_VERSION
    ) {
      errors.push(`${packagePath} must own the exact license scan policy`);
    }
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
