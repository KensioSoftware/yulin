import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The process.env a sim Lambda handler function sees while it runs.
 *
 * A handler backed by a real in-process function is a closure over its own
 * module scope, so unlike zip code running in a vm context it has no sandbox
 * to give it an environment of its own: it reads the host process.env like
 * any other code in the test run. Node.js asynchronous context tracking
 * bridges that gap. The function's variables are held in an
 * AsyncLocalStorage store for the duration of the invocation, and process.env
 * resolves to that store while it is set.
 *
 * The store follows the invocation across await points, and concurrent
 * invocations of different functions each see their own variables, which a
 * swap-and-restore around the handler call could not manage.
 *
 * The one thing this cannot reach is a read that already happened. A handler
 * module doing `const TABLE = process.env.TABLE_NAME` at module scope is
 * evaluated when the test file imports it, long before any invocation, so it
 * captures the host value. Reads inside the handler body see the function's
 * own variables. See SimLambdaEnvironmentConflicts, which warns when that
 * distinction actually changes what the code sees.
 */
class SimLambdaProcessEnvironment {
  private readonly storage = new AsyncLocalStorage<Record<string, string>>();
  private hostEnvironment: NodeJS.ProcessEnv = process.env;
  private installed = false;

  /**
   * Run an invocation with the given variables as its process.env.
   */
  async run<T>(
    variables: Record<string, string>,
    run: () => Promise<T>,
  ): Promise<T> {
    this.install();
    return await this.storage.run(variables, run);
  }

  /**
   * The host process environment, ignoring any invocation in progress.
   */
  hostVariables(): NodeJS.ProcessEnv {
    return this.hostEnvironment;
  }

  /**
   * Redefine process.env as an accessor backed by the invocation store.
   *
   * process.env is a plain configurable data property on process, so it can
   * be replaced with a getter. Outside a sim Lambda invocation the getter
   * hands back the untouched host environment object, so the patch is inert:
   * anything that reads, writes, or stubs process.env normally is unaffected.
   *
   * Installed once and never removed. Removing it would be unsafe while
   * another invocation is in flight, and there is nothing to gain: an
   * installed patch with no invocation running behaves exactly like no patch
   * at all.
   */
  private install(): void {
    if (this.installed) {
      return;
    }

    this.hostEnvironment = process.env;
    Object.defineProperty(process, "env", {
      configurable: true,
      enumerable: true,
      get: (): NodeJS.ProcessEnv =>
        this.storage.getStore() ?? this.hostEnvironment,
      set: (replacement: NodeJS.ProcessEnv): void => {
        this.replaceVariables(replacement);
      },
    });
    this.installed = true;
  }

  /**
   * Apply an assignment to process.env as a whole.
   *
   * Inside an invocation this has to stay invocation-local, like a write to a
   * single variable does, or function code could wipe out the host
   * environment for the rest of the test run. The store's object identity is
   * fixed for the run, so the assignment is copied into it rather than
   * swapping the reference. Outside an invocation it replaces the host
   * environment, as an assignment to process.env normally would.
   */
  private replaceVariables(replacement: NodeJS.ProcessEnv): void {
    const store = this.storage.getStore();
    if (store === undefined) {
      this.hostEnvironment = replacement;
      return;
    }

    for (const name of Object.keys(store)) {
      Reflect.deleteProperty(store, name);
    }
    for (const [name, value] of Object.entries(replacement)) {
      if (value !== undefined) {
        // oxlint-disable-next-line security/detect-object-injection
        store[name] = value;
      }
    }
  }
}

/**
 * Shared because it patches a process global: one patch, one store.
 */
export const simLambdaProcessEnvironment = new SimLambdaProcessEnvironment();
