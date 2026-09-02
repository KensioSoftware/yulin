import { SimLambdaRuntimeError } from "../../../error/sim-lambda-runtime.error.js";
import type { SimLambdaVmModules } from "./sim-lambda-vm-modules.js";

/**
 * Importing a function's handler module and finding the export it names.
 *
 * Both steps report the AWS-like `Runtime.*` error a real cold start reports,
 * which is why they sit together.
 */

/**
 * Import the module a handler name points at.
 *
 * Anything the import threw that is not already a runtime error becomes a
 * `Runtime.ImportModuleError`, as it does on real Lambda.
 */
export function importSimLambdaHandlerModule(
  modules: SimLambdaVmModules,
  modulePath: string,
): unknown {
  try {
    return modules.requireModule(`./${modulePath}`);
  } catch (error) {
    if (error instanceof SimLambdaRuntimeError) {
      throw error;
    }

    throw new SimLambdaRuntimeError(
      "Runtime.ImportModuleError",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Look up the handler export, tolerating a module that exported a nullish
 * value so the lookup still reports Runtime.HandlerNotFound.
 *
 * Only own exports count. Walking the prototype chain would let a handler
 * name like `index.constructor` resolve to an `Object.prototype` member and
 * be invoked as the handler, where real Lambda reports HandlerNotFound.
 */
export function simLambdaExportedHandler(
  moduleExports: unknown,
  exportName: string,
): unknown {
  if (moduleExports === null || moduleExports === undefined) {
    return undefined;
  }

  const exportedValues = moduleExports as Record<string, unknown>;

  if (!Object.hasOwn(exportedValues, exportName)) {
    return undefined;
  }

  return Reflect.get(exportedValues, exportName);
}
