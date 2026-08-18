/**
 * @name Issue #61 prototype Node module path diagnostic
 * @kind problem
 * @severity warning
 * @id js/issue61/prototype-node-module-path-diagnostic
 */

import javascript
import semmle.javascript.NodeJS

from NodeModule canonicalModule
where canonicalModule.getFile().getRelativePath().matches("%httpAdmissionMiddleware.js")
select canonicalModule.getFile(),
  "NodeModule path=" + canonicalModule.getFile().getRelativePath()
