/**
 * @name Issue #61 prototype export value shape diagnostic
 * @kind problem
 * @severity warning
 * @id js/issue61/prototype-export-value-shape-diagnostic
 */

import javascript
import semmle.javascript.NodeJS

from NodeModule canonicalModule, DataFlow::Node exportedFactory
where
  canonicalModule.getFile().getRelativePath() = "src/rateLimit/httpAdmissionMiddleware.js" and
  exportedFactory = canonicalModule.getAnExportedValue("createHttpRateLimitMiddleware")
select exportedFactory.asExpr(), "Export value expression shape"
