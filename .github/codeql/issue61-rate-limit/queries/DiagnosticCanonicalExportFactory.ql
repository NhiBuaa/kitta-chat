/**
 * @name Issue #61 canonical export/factory diagnostic
 * @kind problem
 * @severity warning
 * @id js/issue61/canonical-export-factory-diagnostic
 */

import javascript
import semmle.javascript.NodeJS

class CanonicalLimiterModule extends NodeModule {
  CanonicalLimiterModule() {
    this.getFile().getRelativePath() = "rateLimit/httpAdmissionMiddleware.js"
    or
    this.getFile().getRelativePath() = "src/rateLimit/httpAdmissionMiddleware.js"
    or
    this.getFile().getRelativePath() = "server/src/rateLimit/httpAdmissionMiddleware.js"
  }
}

from CanonicalLimiterModule canonicalModule, DataFlow::Node exportedFactory,
  DataFlow::CallNode factoryCall, DataFlow::FunctionNode factory
where
  exportedFactory = canonicalModule.getAnExportedValue("createHttpRateLimitMiddleware") and
      factory = exportedFactory.getAFunctionValue() and
  factoryCall.getACallee() = factory.getFunction()
select factoryCall, "Canonical module export is invoked as the middleware factory."
