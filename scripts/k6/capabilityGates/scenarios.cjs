const {
  scenarioCallsDisabled,
  scenarioCallsEnabled,
  scenarioDisabledAuth,
  scenarioDisabledUpload,
  scenarioEnvMatrix,
} = require("./capabilityScenarios.cjs");
const { scenarioLimiterContract } = require("./limiterScenario.cjs");
const {
  scenarioLegacyContract,
  scenarioSyntheticSignup,
} = require("./signupScenarios.cjs");

module.exports = {
  "calls-disabled": scenarioCallsDisabled,
  "calls-enabled": scenarioCallsEnabled,
  "disabled-auth": scenarioDisabledAuth,
  "disabled-upload": scenarioDisabledUpload,
  "env-matrix": scenarioEnvMatrix,
  "legacy-contract": scenarioLegacyContract,
  "limiter-contract": scenarioLimiterContract,
  "synthetic-signup": scenarioSyntheticSignup,
};
