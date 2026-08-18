import type { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import {
  SimLambdaNoVmSdkModuleProvider,
  type SimLambdaVmSdkModuleProvider,
} from "./vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimLambdaExecutableCode } from "./sim-lambda-executable-code.js";
import { parseLambdaHandlerName } from "./sim-lambda-handler-name.js";
import {
  makeSimLambdaVmContext,
  type SimLambdaVmContextProperties,
} from "./vm/sim-lambda-vm-context.js";
import {
  simLambdaNoOutputSink,
  type SimLambdaOutputSink,
} from "../logging/sim-lambda-output-sink.js";
import { SimLambdaVmModules } from "./vm/sim-lambda-vm-modules.js";

/**
 * The archive and handler this code runs, on top of everything its sandbox is
 * built from.
 */
interface SimLambdaVmZipCodeProperties extends SimLambdaVmContextProperties {
  readonly archive: SimZipArchive;
  readonly handlerName: string;
  readonly sdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
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
  /**
   * The sandbox owns its own globals, so the handler needs nothing bridged
   * from the host process to run with the simulation's environment and time.
   */
  readonly runsInHostScope = false;

  #handler: SimLambdaHandler | undefined;
  #sink: SimLambdaOutputSink = simLambdaNoOutputSink;

  constructor(private readonly properties: SimLambdaVmZipCodeProperties) {}

  /**
   * Record what this code writes to its standard streams.
   *
   * The sandbox is built at cold start, and an invocation sets this before it
   * asks for the handler, so the streams function code is handed already carry
   * the sink by the time any of it runs.
   */
  recordOutputTo(sink: SimLambdaOutputSink): void {
    this.#sink = sink;
  }

  /**
   * Get the handler function, cold-starting the module code if needed.
   */
  handlerFunction(): SimLambdaHandler {
    this.#handler ??= this.coldStart();
    return this.#handler;
  }

  private coldStart(): SimLambdaHandler {
    const { archive, handlerName, sdkModuleProvider } = this.properties;
    const parsedName = parseLambdaHandlerName(handlerName);

    const modules = new SimLambdaVmModules({
      archive,
      context: makeSimLambdaVmContext({ ...this.properties, sink: this.#sink }),
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
