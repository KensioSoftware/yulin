import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import { SimLambdaClockTimer } from "./sim-lambda-clock-timer.js";
import {
  type SimLambdaTimerCallback,
  SimLambdaTimerHandle,
  type SimLambdaTimerOwner,
  type SimLambdaTimers,
} from "./sim-lambda-timer-handle.js";

interface SimLambdaInvocationTimersProperties {
  readonly background: BackgroundScheduler;

  /** Where an error thrown out of a timer callback goes. */
  readonly failed: (error: unknown) => void;
}

/**
 * The timers one sim Lambda invocation has asked for.
 *
 * A handler's `setTimeout` measures its delay on the simulation's clock, so a
 * test advancing time by the delay is what releases a sleeping handler, and a
 * frozen clock leaves it asleep for as long as the test likes. The timers
 * belong to the invocation rather than to the process: two simulations running
 * at once each keep their own, and each one's are given up when its invocation
 * ends, the way a real execution environment is frozen once it has answered.
 *
 * While any of them is outstanding the invocation is waiting on the clock, so
 * whatever is waiting for the simulation to settle stops waiting for it.
 * Nothing but the clock is going to release it, and moving the clock is what
 * that wait is holding up.
 */
export class SimLambdaInvocationTimers
  implements SimLambdaTimers, SimLambdaTimerOwner
{
  readonly #background: BackgroundScheduler;
  readonly #failed: (error: unknown) => void;
  readonly #running = new Map<SimLambdaTimerHandle, SimLambdaClockTimer>();

  #released: (() => void) | undefined;

  constructor(properties: SimLambdaInvocationTimersProperties) {
    this.#background = properties.background;
    this.#failed = properties.failed;
  }

  /**
   * Run a callback once simulated time has moved on by a delay.
   */
  setTimeout(
    callback: SimLambdaTimerCallback,
    delay?: number,
    ...arguments_: unknown[]
  ): SimLambdaTimerHandle {
    return this.#start(delay, (handle) => {
      this.#forget(handle);
      this.#call(callback, arguments_);
    });
  }

  /**
   * Run a callback every time simulated time moves on by a delay.
   */
  setInterval(
    callback: SimLambdaTimerCallback,
    delay?: number,
    ...arguments_: unknown[]
  ): SimLambdaTimerHandle {
    return this.#start(delay, (_handle, timer) => {
      timer.again();
      this.#call(callback, arguments_);
    });
  }

  /**
   * Give up one timer, as `clearTimeout` and `clearInterval` do.
   */
  clear(handle: SimLambdaTimerHandle): void {
    this.#running.get(handle)?.cancel();
    this.#forget(handle);
  }

  /**
   * Give up every timer this invocation still has outstanding.
   */
  cancelAll(): void {
    for (const timer of this.#running.values()) {
      timer.cancel();
    }

    this.#running.clear();
    this.#stopWaitingOnClock();
  }

  /**
   * Put one timer on the clock, and keep it while it is outstanding.
   *
   * The work a timer does needs the timer itself, to start the next turn of an
   * interval, and the timer needs the work to be built with, so the work is
   * given both once both exist.
   */
  #start(
    delay: number | undefined,
    work: (handle: SimLambdaTimerHandle, timer: SimLambdaClockTimer) => void,
  ): SimLambdaTimerHandle {
    const handle = new SimLambdaTimerHandle(this);
    const timer: SimLambdaClockTimer = new SimLambdaClockTimer({
      background: this.#background,
      run: () => {
        work(handle, timer);
      },
    });

    this.#running.set(handle, timer);

    // A timer with nothing to wait for is not waiting on the clock: it is due
    // at the instant the clock already reads, and the next turn of the host
    // event loop runs it.
    if (timer.startIn(delay) > 0) {
      this.#released ??= this.#background.waitingOnClock();
    }

    return handle;
  }

  /**
   * Run one timer's callback, failing the invocation where it throws.
   *
   * An uncaught exception out of a timer callback ends a real invocation, and
   * this one has a whole simulation around it: left to escape, the error would
   * come out of whatever moved the clock instead, which is nothing to do with
   * the handler that scheduled it.
   */
  #call(callback: SimLambdaTimerCallback, arguments_: unknown[]): void {
    try {
      callback(...arguments_);
    } catch (error) {
      this.#failed(error);
    }
  }

  #forget(handle: SimLambdaTimerHandle): void {
    this.#running.delete(handle);

    if (this.#running.size === 0) {
      this.#stopWaitingOnClock();
    }
  }

  #stopWaitingOnClock(): void {
    this.#released?.();
    this.#released = undefined;
  }
}
