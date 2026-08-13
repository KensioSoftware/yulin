import { AsyncLocalStorage } from "node:async_hooks";

import type { CffCloudFrontModule } from "./cff-cloudfront-module.js";

/**
 * The `cf` a CloudFront Function sees while it runs.
 *
 * A Function given as a function reference is a closure over its own module
 * scope, so unlike source code running in a vm context it has no sandbox to
 * give it a `cloudfront` module of its own: it reads globals from the host
 * process like any other code in the test run. Node.js asynchronous context
 * tracking bridges that gap. The module is held in an AsyncLocalStorage store
 * for the duration of the invocation, and the global `cf` resolves to that
 * store while it is set.
 *
 * The store follows the invocation across await points, which matters here
 * because reading a key value store is awaited. Two Functions associated with
 * different stores, invoked concurrently, each see their own, which a
 * swap-and-restore around the handler call could not manage.
 *
 * Outside an invocation the global is undefined, so the patch is inert:
 * `cf` means nothing in ordinary test code, and a bound handler called directly
 * rather than through a Function fails on `cf` being undefined rather than
 * silently reading another Function's store.
 */
/**
 * One invocation's module, and whether that invocation is still running.
 */
interface CffInvocation {
  readonly module: CffCloudFrontModule;
  active: boolean;
}

class SimCffCloudFrontGlobal {
  private readonly storage = new AsyncLocalStorage<CffInvocation>();
  private installed = false;

  /**
   * Run an invocation with the given module as its `cf`.
   */
  async run<T>(module: CffCloudFrontModule, run: () => Promise<T>): Promise<T> {
    this.install();

    const invocation: CffInvocation = { module, active: true };

    try {
      return await this.storage.run(invocation, run);
    } finally {
      invocation.active = false;
    }
  }

  /**
   * The module the invocation in progress is using, if there is one.
   *
   * An invocation that has finished holds nothing, even though asynchronous
   * context still reaches its store. Work a Function starts and does not await
   * outlives the invocation here, and in CloudFront it does not: the Function
   * is done when it returns. Reading `cf` from that leaked work finds nothing
   * rather than a store the Function is no longer entitled to.
   */
  current(): CffCloudFrontModule | undefined {
    const invocation = this.storage.getStore();

    if (invocation?.active !== true) {
      return undefined;
    }

    return invocation.module;
  }

  /**
   * Define `cf` as a global accessor backed by the invocation store.
   *
   * Installed once and never removed. Removing it would be unsafe while
   * another invocation is in flight, and there is nothing to gain: an
   * installed accessor with no invocation running reads as undefined, exactly
   * as though it were not there.
   *
   * It stays configurable so that a second copy of this package in one process
   * can install over the first. Locking it down would stop a Function
   * reassigning `cf`, which is the Function sabotaging its own test rather than
   * a boundary worth defending, at the cost of turning a duplicated dependency
   * into a hard throw.
   */
  private install(): void {
    if (this.installed) {
      return;
    }

    Object.defineProperty(globalThis, "cf", {
      configurable: true,
      get: (): CffCloudFrontModule | undefined => this.current(),
    });

    this.installed = true;
  }
}

/**
 * The `cf` global, shared by every simulated CloudFront Function in a process.
 *
 * One accessor is installed for the process, and which module it resolves to
 * is per-invocation, so a single global is all that is needed.
 */
export const simCffCloudFrontGlobal = new SimCffCloudFrontGlobal();
