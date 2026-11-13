import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import { simLambdaExportedHandler } from "./vm/sim-lambda-vm-handler-lookup.js";

/**
 * Imports a handler module, answering with its exports, as
 * `() => import("./orders.js")` does.
 */
export type SimLambdaModuleLoader = () => Promise<unknown>;

/**
 * A real in-process handler module, imported at the function's cold start.
 *
 * The module is imported during the first invocation, with the function's
 * environment variables and the simulation's clock in place. Its module scope
 * therefore reads what it would read on real Lambda. Node.js imports a module
 * once per process, so the module scope runs once, in the first invocation of
 * whichever function imports it first.
 */
export class SimLambdaHandlerModule {
  readonly #load: SimLambdaModuleLoader;
  readonly #exportName: string;
  #handler: Promise<SimLambdaHandler> | undefined;

  constructor(load: SimLambdaModuleLoader, exportName: string) {
    this.#load = load;
    this.#exportName = exportName;
  }

  /**
   * The text identifying this module's code, taken over the loader and the
   * export it names.
   */
  get identity(): string {
    return `${this.#load.toString()}#${this.#exportName}`;
  }

  /**
   * The handler the module exports, importing the module the first time.
   *
   * A failed import calls the loader again on the next invocation, as a real
   * cold start that failed starts again. Node.js keeps the error from an ES
   * module whose top-level code threw, so that import fails the same way.
   */
  async handler(): Promise<SimLambdaHandler> {
    this.#handler ??= this.imported();

    try {
      return await this.#handler;
    } catch (error) {
      this.#handler = undefined;
      throw error;
    }
  }

  private async imported(): Promise<SimLambdaHandler> {
    const handler = simLambdaExportedHandler(
      await this.exports(),
      this.#exportName,
    );

    if (typeof handler !== "function") {
      throw new SimLambdaRuntimeError(
        "Runtime.HandlerNotFound",
        `${this.#exportName} is undefined or not exported by the handler module`,
      );
    }

    return handler as SimLambdaHandler;
  }

  private async exports(): Promise<unknown> {
    try {
      return await this.#load();
    } catch (error) {
      throw new SimLambdaRuntimeError(
        "Runtime.ImportModuleError",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

/**
 * A real in-process handler, given as the function itself or as the module
 * exporting it.
 */
export type SimLambdaHandlerSource<TEvent = never, TResult = unknown> =
  | SimLambdaHandler<TEvent, TResult>
  | SimLambdaHandlerModule;

/**
 * A handler module for a function to import at its cold start.
 *
 * ```typescript
 * makeLambdaZipFileInput(lambdaHandlerModule(() => import("./orders.js")));
 * ```
 *
 * The module's top-level code then reads the function's environment variables
 * and the simulation's clock.
 */
export function lambdaHandlerModule(
  load: SimLambdaModuleLoader,
  exportName = "handler",
): SimLambdaHandlerModule {
  return new SimLambdaHandlerModule(load, exportName);
}

/**
 * The handler a handler source stands for, importing its module if needed.
 */
export async function simLambdaHandlerOf(
  source: SimLambdaHandlerSource,
): Promise<SimLambdaHandler> {
  if (source instanceof SimLambdaHandlerModule) {
    return await source.handler();
  }

  return source;
}

/**
 * The text identifying a handler source's code, for its package digest.
 */
export function simLambdaHandlerIdentity(
  source: SimLambdaHandlerSource,
): string {
  return source instanceof SimLambdaHandlerModule
    ? source.identity
    : source.toString();
}
