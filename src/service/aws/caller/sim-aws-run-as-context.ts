import { AsyncLocalStorage } from "node:async_hooks";
import type { SimAwsPrincipal } from "./sim-aws-caller.js";

interface SimAwsRunAsFrame {
  readonly owner: object;
  readonly caller: SimAwsPrincipal;
}

const storage = new AsyncLocalStorage<SimAwsRunAsFrame>();

/**
 * Ambient simulated caller context, tracked with Node.js asynchronous context
 * tracking.
 *
 * The ambient caller is scoped to one owning SimAws instance so that separate
 * simulations in the same process never observe each other's callers. Nested
 * runs stack: the innermost frame wins, and the outer frame is restored when
 * the inner function completes.
 */
export const simAwsRunAsContext = {
  /**
   * Run a function with an ambient caller for one SimAws owner.
   */
  async run<T>(
    owner: object,
    caller: SimAwsPrincipal,
    run: () => Promise<T>,
  ): Promise<T> {
    return await storage.run({ owner, caller }, run);
  },

  /**
   * Get the current ambient caller for an owner, if there is one.
   */
  currentCaller(owner: object): SimAwsPrincipal | undefined {
    const frame = storage.getStore();
    if (frame?.owner !== owner) {
      return undefined;
    }
    return frame.caller;
  },
};
