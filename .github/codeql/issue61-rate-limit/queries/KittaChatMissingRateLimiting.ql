/**
 * @name Missing rate limiting with the canonical Kitta Chat middleware model
 * @description Equivalent of js/missing-rate-limiting with a narrow repository-owned model
 *              for the canonical Redis-backed Express middleware.
 * @kind problem
 * @problem.severity warning
 * @security-severity 7.5
 * @precision high
 * @id js/issue61/missing-rate-limiting
 * @tags security
 *       external/cwe/cwe-770
 *       external/cwe/cwe-307
 *       external/cwe/cwe-400
 */

import javascript
import semmle.javascript.NodeJS
import semmle.javascript.security.dataflow.MissingRateLimiting

/**
 * The repository's canonical HTTP limiter is the exported factory in
 * server/src/rateLimit/httpAdmissionMiddleware.js.  The model binds the
 * module export and resolved callee, then uses the factory call result as the
 * middleware source.  It deliberately does not match a name-only look-alike.
 */
private class KittaChatCanonicalHttpRateLimit extends RateLimitingMiddleware {
  KittaChatCanonicalHttpRateLimit() {
    exists(
      NodeModule canonicalModule,
      DataFlow::Node exportedFactory,
      DataFlow::FunctionNode factory,
      DataFlow::CallNode factoryCall
    |
      (
        canonicalModule.getFile().getRelativePath() = "rateLimit/httpAdmissionMiddleware.js"
        or
        canonicalModule.getFile().getRelativePath() = "src/rateLimit/httpAdmissionMiddleware.js"
        or
        canonicalModule.getFile().getRelativePath() = "server/src/rateLimit/httpAdmissionMiddleware.js"
      ) and
      exportedFactory = canonicalModule.getAnExportedValue("createHttpRateLimitMiddleware") and
      factory = exportedFactory.getAFunctionValue() and
      factoryCall.getACallee() = factory.getFunction() and
      this = factoryCall
    )
  }
}

from
  Routing::Node useSite, ExpensiveRouteHandler r, string explanation,
  DataFlow::Node reference, string referenceLabel
where
  useSite = Routing::getNode(r).getRouteInstallation() and
  r.explain(explanation, reference, referenceLabel) and
  not useSite.isGuardedByNode(any(RateLimitingMiddleware m).getRoutingNode())
select useSite,
  "This route handler " + explanation + ", but is not rate-limited.",
  reference, referenceLabel
