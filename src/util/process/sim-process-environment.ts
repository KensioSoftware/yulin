import { AsyncLocalStorage } from "node:async_hooks";
import { SimProcessEnvironmentReads } from "./sim-process-environment-reads.js";

/**
 * The process.env in-process handler code sees while a simulated run lasts.
 *
 * This is what a sim Lambda function's environment variables and a sim ECS
 * container's are applied through. A handler backed by a real in-process
 * function is a closure over its own module scope, so unlike zip code running
 * in a vm context it has no sandbox to give it an environment of its own: it
 * reads the host process.env like any other code in the test run. Node.js
 * asynchronous context tracking bridges that gap. The run's variables are held
 * in an AsyncLocalStorage store for its duration, and process.env resolves to
 * that store while it is set.
 *
 * The store follows the run across await points, and concurrent runs each see
 * their own variables, which a swap-and-restore around the handler call could
 * not manage.
 *
 * It is one shared object because it patches a process global. Two of them
 * would each install a getter, and the second would capture whatever the first
 * was reporting at the time as its host environment.
 *
 * The one thing this cannot reach is a read that already happened. A handler
 * module doing `const TABLE = process.env.TABLE_NAME` at module scope is
 * evaluated when the test file imports it, long before any run, and captures
 * the host value. Reads inside the handler body see the run's own variables.
 *
 * Outside a run, process.env is the host environment behind a
 * SimProcessEnvironmentReads view, which records the names read. The patch is
 * installed when this module loads, which is when Yulin is imported, so a
 * module-scope read in a handler imported after Yulin is on record.
 * SimLambdaEnvironmentConflicts warns from that record, and only for a name
 * whose early read changed what the code saw. A read made before Yulin was
 * imported is invisible to it.
 */
class SimProcessEnvironment {
  private readonly storage = new AsyncLocalStorage<Record<string, string>>();
  private readonly reads = new SimProcessEnvironmentReads();
  private hostEnvironment: NodeJS.ProcessEnv = process.env;
  private hostView: NodeJS.ProcessEnv = process.env;

  constructor() {
    this.install();
  }

  /**
   * Run something with the given variables as its process.env.
   */
  async run<T>(
    variables: Record<string, string>,
    run: () => Promise<T>,
  ): Promise<T> {
    return await this.storage.run(variables, run);
  }

  /**
   * Whether code read the name from process.env while no run was active.
   *
   * Reads made before this module loaded are not on record.
   */
  wasReadOutsideRun(name: string): boolean {
    return this.reads.wasRead(name);
  }

  /**
   * The host process environment, ignoring any run in progress.
   */
  hostVariables(): NodeJS.ProcessEnv {
    return this.hostEnvironment;
  }

  /**
   * The host process environment in the shape a run's variables are held in.
   *
   * A run's store holds string values only, which is what process.env holds
   * once Node.js has read it. The declared type allows undefined, so the
   * names holding one are dropped rather than carried into a run as the
   * string "undefined".
   */
  definedHostVariables(): Record<string, string> {
    const defined: [string, string][] = [];

    for (const [name, value] of Object.entries(this.hostEnvironment)) {
      if (value !== undefined) {
        defined.push([name, value]);
      }
    }

    return Object.fromEntries(defined);
  }

  /**
   * Redefine process.env as an accessor backed by the run store.
   *
   * process.env is a plain configurable data property on process, so it can
   * be replaced with a getter. Outside a simulated run the getter hands back
   * the host environment behind a view that records the names read, and
   * passes every read, write and delete through to it. Anything that reads,
   * writes, or stubs process.env normally is unaffected.
   *
   * Installed once, at construction, and never removed. Removing it would be
   * unsafe while another run is in flight, and there is nothing to gain. With
   * no run in progress, the patch passes everything through to the host
   * environment.
   */
  private install(): void {
    this.useHostEnvironment(process.env);
    Object.defineProperty(process, "env", {
      configurable: true,
      enumerable: true,
      get: (): NodeJS.ProcessEnv => this.storage.getStore() ?? this.hostView,
      set: (replacement: NodeJS.ProcessEnv): void => {
        this.replaceVariables(replacement);
      },
    });
  }

  /**
   * Make the environment the host environment, and watch reads of it.
   *
   * Code saving process.env and assigning it back hands over the watching
   * view, which is unwrapped so that views do not nest.
   */
  private useHostEnvironment(environment: NodeJS.ProcessEnv): void {
    this.hostEnvironment = this.reads.unwrap(environment);
    this.hostView = this.reads.watch(this.hostEnvironment);
  }

  /**
   * Apply an assignment to process.env as a whole.
   *
   * Inside a run this has to stay run-local, like a write to a single variable
   * does, or handler code could wipe out the host environment for the rest of
   * the test run. The store's object identity is fixed for the run, so the
   * assignment is copied into it rather than swapping the reference. Outside a
   * run it replaces the host environment, as an assignment to process.env
   * normally would.
   *
   * The replacement is read before the store is cleared, because handler code
   * saving process.env and assigning it back is assigning the store to itself:
   * clearing first would empty the run's environment rather than keep it.
   */
  private replaceVariables(replacement: NodeJS.ProcessEnv): void {
    const store = this.storage.getStore();
    if (store === undefined) {
      this.useHostEnvironment(replacement);
      return;
    }

    const replacing = Object.entries(replacement);

    for (const name of Object.keys(store)) {
      Reflect.deleteProperty(store, name);
    }
    for (const [name, value] of replacing) {
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
export const simProcessEnvironment = new SimProcessEnvironment();
