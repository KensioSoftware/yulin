import type { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import {
  SimLambdaNoVmSdkModuleProvider,
  type SimLambdaVmSdkModuleProvider,
} from "./vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimLambdaExecutableCode } from "./sim-lambda-executable-code.js";
import {
  makeSimLambdaVmContext,
  type SimLambdaVmEnvironment,
} from "./vm/sim-lambda-vm-context.js";
import { SimLambdaVmModules } from "./vm/sim-lambda-vm-modules.js";

interface SimLambdaVmZipCodeProperties {
  readonly archive: SimZipArchive;
  readonly handlerName: string;
  readonly environment: SimLambdaVmEnvironment;
  readonly sdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
}

interface ParsedHandlerName {
  readonly modulePath: string;
  readonly exportName: string;
}

/**
 * Parse an AWS Lambda handler identifier such as "index.handler" or
 * "src/app.handler" into its module path and export name.
 */
export function parseLambdaHandlerName(handlerName: string): ParsedHandlerName {
  const separator = handlerName.lastIndexOf(".");
  if (separator <= 0 || separator === handlerName.length - 1) {
    throw new SimLambdaRuntimeError(
      "Runtime.MalformedHandlerName",
      `Bad handler '${handlerName}': expected format 'file.method'`,
    );
  }
  return {
    modulePath: handlerName.slice(0, separator),
    exportName: handlerName.slice(separator + 1),
  };
}

/**
 * Executable sim Lambda code compiled from a zip archive in a vm context.
 *
 * The module code is imported once, on the first invocation, mirroring a
 * real Lambda cold start: import and handler lookup failures surface as
 * AWS-like Runtime.* invocation errors, and module state persists across
 * invocations like a warm execution environment.
 */
export class SimLambdaVmZipCode implements SimLambdaExecutableCode {
  #handler: SimLambdaHandler | undefined;

  constructor(private readonly properties: SimLambdaVmZipCodeProperties) {}

  /**
   * Get the handler function, cold-starting the module code if needed.
   */
  handlerFunction(): SimLambdaHandler {
    this.#handler ??= this.coldStart();
    return this.#handler;
  }

  private coldStart(): SimLambdaHandler {
    const { archive, handlerName, environment, sdkModuleProvider } =
      this.properties;
    const parsedName = parseLambdaHandlerName(handlerName);

    const modules = new SimLambdaVmModules({
      archive,
      context: makeSimLambdaVmContext(environment),
      sdkModuleProvider:
        sdkModuleProvider ?? new SimLambdaNoVmSdkModuleProvider(),
    });
    const moduleExports = this.importHandlerModule(
      modules,
      parsedName.modulePath,
    );

    const handler = this.exportedHandler(moduleExports, parsedName.exportName);
    if (typeof handler !== "function") {
      throw new SimLambdaRuntimeError(
        "Runtime.HandlerNotFound",
        `${handlerName} is undefined or not exported by ${parsedName.modulePath}`,
      );
    }
    return handler as SimLambdaHandler;
  }

  /**
   * Look up the handler export, tolerating a module that exported a nullish
   * value so the lookup still reports Runtime.HandlerNotFound.
   *
   * Only own exports count. Walking the prototype chain would let a handler
   * name like `index.constructor` resolve to an `Object.prototype` member and
   * be invoked as the handler, where real Lambda reports HandlerNotFound.
   */
  private exportedHandler(moduleExports: unknown, exportName: string): unknown {
    if (moduleExports === null || moduleExports === undefined) {
      return undefined;
    }
    const exportedValues = moduleExports as Record<string, unknown>;
    if (!Object.hasOwn(exportedValues, exportName)) {
      return undefined;
    }
    return Reflect.get(exportedValues, exportName);
  }

  private importHandlerModule(
    modules: SimLambdaVmModules,
    modulePath: string,
  ): unknown {
    try {
      return modules.requireModule(`./${modulePath}`);
    } catch (error) {
      if (error instanceof SimLambdaRuntimeError) {
        throw error;
      }
      let message = String(error);
      if (error instanceof Error) {
        message = error.message;
      }
      throw new SimLambdaRuntimeError("Runtime.ImportModuleError", message);
    }
  }
}
