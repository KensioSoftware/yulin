import {
  clearInterval as hostClearInterval,
  clearTimeout as hostClearTimeout,
} from "node:timers";
import { SimLambdaTimerHandle } from "./sim-lambda-timer-handle.js";

/** Whatever a caller passes to `clearTimeout` or `clearInterval`. */
type SimLambdaTimerGiven = SimLambdaTimerHandle | NodeJS.Timeout | undefined;

/**
 * Give up a timer, whichever kind of timer it turned out to be.
 */
export function simLambdaClearTimeout(handle: SimLambdaTimerGiven): void {
  giveUp(handle, hostClearTimeout);
}

/**
 * Give up a repeating timer, whichever kind of timer it turned out to be.
 */
export function simLambdaClearInterval(handle: SimLambdaTimerGiven): void {
  giveUp(handle, hostClearInterval);
}

/**
 * Give up a timer on the timeline it was made on.
 *
 * The handle says which. A simulated one is given up on the invocation that
 * made it rather than on whichever invocation is running now, so a handle
 * passed around clears what it names.
 */
function giveUp(
  handle: SimLambdaTimerGiven,
  hostClear: (handle: NodeJS.Timeout | undefined) => void,
): void {
  if (handle instanceof SimLambdaTimerHandle) {
    handle.cancel();

    return;
  }

  hostClear(handle);
}
