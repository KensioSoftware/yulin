import { setTimeout } from "node:timers";
import { SimSdkAbortError } from "./error/sim-sdk.error.js";

/**
 * An abort listener installed on a signal for the duration of one send.
 */
type SimSdkAbortListener = () => void;

/**
 * The abort signal an SDK send accepts as `abortSignal` in its options.
 *
 * Typed structurally so no SDK import is needed. A global AbortSignal fits it,
 * and so does the older Smithy signal, which only promises `aborted` and
 * `onabort`.
 */
interface SimSdkAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  onabort?: SimSdkAbortListener | null;
  addEventListener?: (type: "abort", listener: SimSdkAbortListener) => void;
  removeEventListener?: (type: "abort", listener: SimSdkAbortListener) => void;
}

/**
 * The abort signal given to one intercepted SDK send, if any.
 *
 * The real SDK checks the signal in its HTTP handler. A signal aborted before
 * the request goes out rejects the send, and one that fires while the request
 * is pending rejects it then. Either way the send rejects with an AbortError.
 *
 * A real request spends at least one turn of the host's timers on the network,
 * so `AbortSignal.timeout(0)` created for a send aborts it. A simulated
 * operation can settle within microtasks, so a send carrying a signal waits
 * one host timer turn before it is dispatched.
 *
 * The simulated operation is not cancelled. Once dispatched, it carries on, as
 * a request already received by AWS does.
 */
export class SimSdkSendAbort {
  private readonly signal: SimSdkAbortSignal | undefined;

  private constructor(signal: SimSdkAbortSignal | undefined) {
    this.signal = signal;
  }

  /**
   * Read the abort signal from the arguments given to send after the Command.
   */
  static fromSendArguments(rest: readonly unknown[]): SimSdkSendAbort {
    const options = rest[0];
    if (typeof options !== "object" || options === null) {
      return new SimSdkSendAbort(undefined);
    }
    const signal = (options as { abortSignal?: unknown }).abortSignal;
    if (!isAbortSignal(signal)) {
      return new SimSdkSendAbort(undefined);
    }
    return new SimSdkSendAbort(signal);
  }

  /**
   * Run a simulated operation unless the signal has already fired, rejecting
   * with an AbortError if it fires before the operation settles.
   */
  async run(operation: () => Promise<unknown>): Promise<unknown> {
    const signal = this.signal;
    if (signal === undefined) {
      return await operation();
    }
    if (signal.aborted) {
      throw SimSdkAbortError.fromReason(signal.reason);
    }

    const abort = Promise.withResolvers<never>();
    const unsubscribe = subscribe(signal, () => {
      abort.reject(SimSdkAbortError.fromReason(signal.reason));
    });
    try {
      return await Promise.race([
        dispatchAfterRoundTrip(signal, operation),
        abort.promise,
      ]);
    } finally {
      unsubscribe();
    }
  }
}

/**
 * Dispatch a simulated operation after one turn of the host's timers, unless
 * the signal fires first.
 *
 * Node runs timers of the same delay in the order they were set, so a signal
 * set to time out after 0 or 1 milliseconds before the send fires before this
 * turn ends.
 */
async function dispatchAfterRoundTrip(
  signal: SimSdkAbortSignal,
  operation: () => Promise<unknown>,
): Promise<unknown> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  if (signal.aborted) {
    throw SimSdkAbortError.fromReason(signal.reason);
  }
  return await operation();
}

/**
 * Whether a send option is usable as an abort signal.
 */
function isAbortSignal(signal: unknown): signal is SimSdkAbortSignal {
  return (
    typeof signal === "object" &&
    signal !== null &&
    typeof (signal as { aborted?: unknown }).aborted === "boolean"
  );
}

/**
 * Listen for a signal firing, the way the SDK's HTTP handler does: through
 * addEventListener where the signal has it, and through onabort otherwise.
 *
 * Returns the function that stops listening.
 */
function subscribe(
  signal: SimSdkAbortSignal,
  listener: SimSdkAbortListener,
): () => void {
  if (
    typeof signal.addEventListener === "function" &&
    typeof signal.removeEventListener === "function"
  ) {
    signal.addEventListener("abort", listener);
    return () => {
      signal.removeEventListener?.("abort", listener);
    };
  }

  // The older Smithy signal offers no addEventListener, so onabort is the only
  // way to listen, and the previous handler is put back afterwards.
  const previous = signal.onabort ?? null;
  // oxlint-disable-next-line unicorn-js/prefer-add-event-listener -- this signal has no addEventListener to prefer.
  signal.onabort = listener;
  return () => {
    // oxlint-disable-next-line unicorn-js/prefer-add-event-listener -- this signal has no addEventListener to prefer.
    signal.onabort = previous;
  };
}
