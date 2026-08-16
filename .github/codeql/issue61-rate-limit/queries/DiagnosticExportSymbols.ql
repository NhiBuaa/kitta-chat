/**
 * @name Issue #61 prototype export symbol diagnostic
 * @kind problem
 * @severity warning
 * @id js/issue61/prototype-export-symbol-diagnostic
 */

import javascript
import semmle.javascript.NodeJS

from NodeModule canonicalModule, string symbol
where
  canonicalModule.getFile().getRelativePath() = "src/rateLimit/httpAdmissionMiddleware.js" and
  symbol = canonicalModule.getAnExportedSymbol()
select canonicalModule.getFile(), "Exported symbol=" + symbol
