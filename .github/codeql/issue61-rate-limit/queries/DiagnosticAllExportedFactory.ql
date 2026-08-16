/**
 * @name Issue #61 prototype export discovery diagnostic
 * @kind problem
 * @severity warning
 * @id js/issue61/prototype-export-discovery-diagnostic
 */

import javascript
import semmle.javascript.NodeJS

from
  NodeModule canonicalModule,
  DataFlow::Node exportedFactory,
  DataFlow::FunctionNode factory,
  DataFlow::CallNode factoryCall
where
  exportedFactory = canonicalModule.getAnExportedValue("createHttpRateLimitMiddleware") and
  factory = exportedFactory.getAFunctionValue() and
  factoryCall.getACallee() = factory.getFunction()
select factoryCall,
  "Discovered canonical export in " + canonicalModule.getFile().getRelativePath()
