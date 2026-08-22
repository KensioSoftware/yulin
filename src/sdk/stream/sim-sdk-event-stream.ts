import { SimSdkStreamAlreadyConsumedError } from "../error/sim-sdk.error.js";

/**
 * A simulated SDK event stream: the async iterable an operation modelled on
 * `application/vnd.amazon.eventstream` answers with.
 *
 * The SDK hands one of these to calling code as `ConverseStream`'s `stream`
 * and `InvokeModelWithResponseStream`'s `body`.
 */
export type SimSdkEventStream<TEvent> = AsyncIterable<TEvent>;

/**
 * Build a simulated SDK event stream over the events it yields.
 *
 * Every event is available as soon as the stream is made. Real AWS sends them
 * as the model generates them, and a simulation with no model has nothing to
 * wait for. What the stream keeps is the order and the one-shot reading, which
 * is what code accumulating a response depends on.
 *
 * The stream is consumable once, matching `simSdkStreamBody`. Iterating a
 * second time raises rather than replaying, because a real event stream is a
 * socket that has already been read to the end.
 */
export function simSdkEventStream<TEvent>(
  events: readonly TEvent[],
): SimSdkEventStream<TEvent> {
  let consumed = false;

  return {
    [Symbol.asyncIterator](): AsyncIterator<TEvent> {
      if (consumed) {
        throw new SimSdkStreamAlreadyConsumedError(
          "Simulated SDK event stream was already consumed and cannot be " +
            "read again",
        );
      }

      consumed = true;

      return iterate(events);
    },
  };
}

function iterate<TEvent>(events: readonly TEvent[]): AsyncIterator<TEvent> {
  const pending = events.values();

  return {
    next(): Promise<IteratorResult<TEvent>> {
      return Promise.resolve(pending.next());
    },
  };
}
