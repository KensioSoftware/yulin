import { randomUUID } from "node:crypto";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import { SimLambdaHandlerRunner } from "./sim-lambda-handler-runner.js";
import { SimLambdaInvokeContextBuilder } from "./sim-lambda-invoke-context-builder.js";
import { SimLambdaInvocationDeadline } from "./sim-lambda-invocation-deadline.js";

interface SimLambdaInvocationProperties {
  readonly functionName: string;

  /** The version the invocation is running, which is `$LATEST` or a number. */
  readonly functionVersion: string;
  readonly invokedFunctionArn: string;
  readonly timeoutSeconds: number;
  readonly memorySizeMb: number;
  readonly logGroupName: string;

  /** The stream this invocation's execution environment writes to. */
  readonly logStreamName: string;

  /** The clock the remaining time is measured against. */
  readonly clock: SimClock;

  /**
   * The scheduler this invocation's timers and deadline wait on. A function
   * built standalone, outside a SimAws instance, has none, and its handler
   * keeps the host timers every other line in the process uses.
   */
  readonly background: BackgroundScheduler | undefined;
}

/**
 * One run of a sim Lambda function's handler.
 *
 * It holds what the handler's own context reports, including the request id
 * the invocation is known by, and it runs the handler inside the time it has
 * to finish in. A function built standalone, outside a SimAws instance, has no
 * scheduler for that deadline to wait on, and its handler runs for as long as
 * it likes on the host timers every other line in the process uses.
 */
export class SimLambdaInvocation {
  readonly #properties: SimLambdaInvocationProperties;
  readonly #runner = new SimLambdaHandlerRunner();
  readonly #awsRequestId = randomUUID();

  constructor(properties: SimLambdaInvocationProperties) {
    this.#properties = properties;
  }

  /**
   * Run a handler function for one invocation event, up to this invocation's
   * deadline.
   *
   * Resolves with the handler result, or rejects with the handler error or
   * the timeout.
   */
  async run(
    handlerFunction: SimLambdaHandler,
    event: unknown,
  ): Promise<unknown> {
    const contextBuilder = new SimLambdaInvokeContextBuilder({
      ...this.#properties,
      awsRequestId: this.#awsRequestId,
    });

    const handler = async (): Promise<unknown> =>
      await this.#runner.run(handlerFunction, event, contextBuilder);
    const { background, timeoutSeconds } = this.#properties;

    if (background === undefined) {
      return await handler();
    }

    return await new SimLambdaInvocationDeadline({
      background,
      timeoutSeconds,
      awsRequestId: this.#awsRequestId,
    }).around(handler);
  }
}
