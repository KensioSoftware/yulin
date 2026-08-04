import { AsyncLocalStorage } from "node:async_hooks";

/**
 * One poller, while it is inside a delivery.
 *
 * Typed as a bare object because only its identity is used, as a key.
 */
export type SimLambdaEventSourceDelivering = object;

const storage = new AsyncLocalStorage<
  ReadonlySet<SimLambdaEventSourceDelivering>
>();

/**
 * Which pollers are currently inside a delivery, tracked with Node.js
 * asynchronous context tracking.
 *
 * This is how a mapping tells a record its own function wrote from a record
 * something else wrote while the function was running. Everything the handler
 * does, including the simulated writes it awaits, happens inside the delivery's
 * asynchronous context; a write made anywhere else does not, however exactly it
 * lands in the same moment.
 *
 * A set rather than a single poller, so two mappings feeding each other are
 * caught as well as one feeding itself: the inner delivery keeps the outer one
 * visible for as long as it runs.
 */
export const simLambdaEventSourceDeliveryContext = {
  /**
   * Run a delivery, marking the poller making it.
   */
  async run<T>(
    delivering: SimLambdaEventSourceDelivering,
    delivery: () => Promise<T>,
  ): Promise<T> {
    const inside = new Set(storage.getStore());
    inside.add(delivering);

    return await storage.run(inside, delivery);
  },

  /**
   * Whether a poller is inside a delivery of its own right now.
   */
  isDelivering(delivering: SimLambdaEventSourceDelivering): boolean {
    return storage.getStore()?.has(delivering) ?? false;
  },
};
