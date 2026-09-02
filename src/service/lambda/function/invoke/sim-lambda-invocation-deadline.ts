import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { SimLambdaClockTimer } from "./timer/sim-lambda-clock-timer.js";
import { SimLambdaInvocationTimers } from "./timer/sim-lambda-invocation-timers.js";
import { simLambdaProcessTimers } from "./timer/sim-lambda-process-timers.js";
import { simLambdaTimedOutError } from "./sim-lambda-timed-out.error.js";

const millisecondsPerSecond = 1000;

interface SimLambdaInvocationDeadlineProperties {
  readonly background: BackgroundScheduler;
  readonly timeoutSeconds: number;
  readonly awsRequestId: string;
}

/**
 * The time one invocation has to finish in, and the timers it gets while it
 * runs.
 *
 * Both wait on the simulation's clock. Whichever arrives first decides: a
 * handler that answers in time is answered with, and a deadline that arrives
 * first ends the invocation in the timeout error real Lambda reports. Nothing
 * waits for a handler that has been timed out, and what it goes on to do
 * reaches nobody, which is the closest an in-process simulation gets to an
 * execution environment being taken away.
 */
export class SimLambdaInvocationDeadline {
  readonly #properties: SimLambdaInvocationDeadlineProperties;

  constructor(properties: SimLambdaInvocationDeadlineProperties) {
    this.#properties = properties;
  }

  /**
   * Run the handler with timers of its own, up to this deadline.
   */
  async around<T>(handler: () => Promise<T>): Promise<T> {
    const { background, awsRequestId, timeoutSeconds } = this.#properties;
    const stopped = Promise.withResolvers<never>();

    // Read whether or not the race gets that far, so an invocation the handler
    // wins never leaves this rejection unhandled.
    // oxlint-disable-next-line unicorn-js/prefer-await -- nothing awaits it.
    stopped.promise.catch(() => {
      //
    });

    // Everything this invocation has on the clock stops the instant it is
    // over, and the instant is what matters. Whatever ended it is inside a
    // clock advance already walking towards the next thing due, and a timer
    // given up a few turns of the microtask queue later has had time to run
    // first. So an invocation ends its timers as it ends, rather than as the
    // answer works its way out through everything wrapped around it.
    const ending = (): void => {
      timers.cancelAll();
      deadline.cancel();
    };
    const failing = (error: unknown): void => {
      ending();
      stopped.reject(error);
    };
    const timers = new SimLambdaInvocationTimers({
      background,
      failed: failing,
    });
    const deadline = new SimLambdaClockTimer({
      background,
      run: (): void => {
        failing(
          simLambdaTimedOutError({
            at: background.now(),
            awsRequestId,
            timeoutSeconds,
          }),
        );
      },
    });

    deadline.startAt(
      new Date(
        background.now().getTime() + timeoutSeconds * millisecondsPerSecond,
      ),
    );

    try {
      return await background.outstanding(
        async () => await racing(timers, stopped, handler, ending),
      );
    } finally {
      ending();
    }
  }
}

/**
 * Answer with whichever comes first, the handler or the end of its time.
 */
async function racing<T>(
  timers: SimLambdaInvocationTimers,
  stopped: PromiseWithResolvers<never>,
  handler: () => Promise<T>,
  ending: () => void,
): Promise<T> {
  return await simLambdaProcessTimers.run(timers, async () => {
    const answer = handler();

    // Ended as the handler settles rather than as the invocation finishes
    // unwinding, and read either way, so a handler that fails after being
    // timed out has nobody left to be unhandled at.
    // oxlint-disable-next-line unicorn-js/prefer-await -- not waited for.
    answer.then(ending, ending);

    return await Promise.race([answer, stopped.promise]);
  });
}
