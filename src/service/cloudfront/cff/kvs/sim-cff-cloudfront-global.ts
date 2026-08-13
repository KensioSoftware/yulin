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
class SimCffCloudFrontGlobal {
  private readonly storage = new AsyncLocalStorage<CffCloudFrontModule>();
  private installed = false;

  /**
   * Run an invocation with the given module as its `cf`.
   */
  async run<T>(module: CffCloudFrontModule, run: () => Promise<T>): Promise<T> {
    this.install();

    return await this.storage.run(module, run);
  }

  /**
   * The module the invocation in progress is using, if there is one.
   */
  current(): CffCloudFrontModule | undefined {
    return this.storage.getStore();
  }

  /**
   * Define `cf` as a global accessor backed by the invocation store.
   *
   * Installed once and never removed. Removing it would be unsafe while
   * another invocation is in flight, and there is nothing to gain: an
   * installed accessor with no invocation running reads as undefined, exactly
   * as though it were not there.
   */
  private install(): void {
    if (this.installed) {
      return;
    }

    Object.defineProperty(globalThis, "cf", {
      configurable: true,
      get: (): CffCloudFrontModule | undefined => this.storage.getStore(),
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
