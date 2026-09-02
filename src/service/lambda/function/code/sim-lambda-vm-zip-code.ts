import type { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import {
  SimLambdaNoVmSdkModuleProvider,
  type SimLambdaVmSdkModuleProvider,
} from "./vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type {
  SimLambdaCodeConfiguration,
  SimLambdaExecutableCode,
} from "./sim-lambda-executable-code.js";
import { parseLambdaHandlerName } from "./sim-lambda-handler-name.js";
import {
  makeSimLambdaVmContext,
  type SimLambdaVmContextProperties,
} from "./vm/sim-lambda-vm-context.js";
import type { SimLambdaOutput } from "../logging/sim-lambda-output.js";
import {
  simLambdaNoOutputSink,
  type SimLambdaOutputSink,
} from "../logging/sim-lambda-output-sink.js";
import { SimLambdaVmModules } from "./vm/sim-lambda-vm-modules.js";
import {
  importSimLambdaHandlerModule,
  simLambdaExportedHandler,
} from "./vm/sim-lambda-vm-handler-lookup.js";

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
  /** Where this execution environment's output goes, and what happens to it. */
  #recording: Pick<SimLambdaVmContextProperties, "sink" | "output"> = {
    sink: simLambdaNoOutputSink,
  };

  constructor(private readonly properties: SimLambdaVmZipCodeProperties) {}

  /**
   * Record what this code writes to its standard streams.
   *
   * The sandbox is built at cold start, and an invocation sets this before it
   * asks for the handler, so the streams function code is handed already carry
   * the sink by the time any of it runs.
   */
  recordOutputTo(sink: SimLambdaOutputSink, output: SimLambdaOutput): void {
    this.#recording = { sink, output };
  }

  /**
   * This archive under changed function settings, ready to cold start again.
   *
   * The sandbox is built from the environment and the export is found by the
   * handler name, and both are fixed once the code has started. So a change to
   * either produces code of its own, holding the same archive, which the next
   * invocation cold starts. Whatever the running module had in memory goes,
   * the way it goes on real Lambda when the configuration changes.
   */
  reconfigured(configuration: SimLambdaCodeConfiguration): SimLambdaVmZipCode {
    return new SimLambdaVmZipCode({
      ...this.properties,
      environment: configuration.environment,
      handlerName: configuration.handlerName ?? this.properties.handlerName,
    });
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
      context: makeSimLambdaVmContext({
        ...this.properties,
        ...this.#recording,
      }),
      sdkModuleProvider:
        sdkModuleProvider ?? new SimLambdaNoVmSdkModuleProvider(),
    });
    const moduleExports = importSimLambdaHandlerModule(
      modules,
      parsedName.modulePath,
    );
    const handler = simLambdaExportedHandler(
      moduleExports,
      parsedName.exportName,
    );

    if (typeof handler !== "function") {
      throw new SimLambdaRuntimeError(
        "Runtime.HandlerNotFound",
        `${handlerName} is undefined or not exported by ${parsedName.modulePath}`,
      );
    }
    return handler as SimLambdaHandler;
  }
}
