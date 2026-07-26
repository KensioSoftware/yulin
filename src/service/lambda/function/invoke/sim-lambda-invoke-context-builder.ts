import { randomUUID } from "node:crypto";
import type {
  SimLambdaCallback,
  SimLambdaContext,
} from "../sim-lambda-handler.type.js";
import {
  type SimClock,
  SimRealClock,
} from "../../../../util/clock/sim-clock.js";

interface SimLambdaInvokeContextBuilderProperties {
  readonly functionName: string;
  readonly invokedFunctionArn: string;
  readonly timeoutSeconds: number;
  readonly memorySizeMb: number;
  /**
   * Clock measuring how much of the invocation timeout is left. Reading the
   * remaining time from the simulation's clock means a stopped clock leaves a
   * handler with a constant budget, rather than one that drains in real time.
   */
  readonly clock?: SimClock | undefined;
}

/**
 * Builds the AWS-like invocation context passed to a sim Lambda handler.
 *
 * The legacy done/fail/succeed completions are wired to the invocation
 * callback so handlers written against any completion style behave the same.
 */
export class SimLambdaInvokeContextBuilder {
  constructor(
    private readonly properties: SimLambdaInvokeContextBuilderProperties,
  ) {}

  /**
   * Build the context for one invocation.
   */
  build(callback: SimLambdaCallback): SimLambdaContext {
    const {
      functionName,
      invokedFunctionArn,
      timeoutSeconds,
      memorySizeMb,
      clock = new SimRealClock(),
    } = this.properties;
    const startedAtMs = clock.now().getTime();
    const awsRequestId = randomUUID();

    return {
      callbackWaitsForEmptyEventLoop: true,
      functionName,
      functionVersion: "$LATEST",
      invokedFunctionArn,
      memoryLimitInMB: String(memorySizeMb),
      awsRequestId,
      logGroupName: `/aws/lambda/${functionName}`,
      logStreamName: `[$LATEST]${awsRequestId}`,
      getRemainingTimeInMillis: (): number =>
        Math.max(
          0,
          timeoutSeconds * 1000 - (clock.now().getTime() - startedAtMs),
        ),
      done: (error?: Error, result?: unknown): void => {
        callback(error ?? null, result);
      },
      fail: (error: Error | string): void => {
        callback(error);
      },
      succeed: (messageOrObject: unknown): void => {
        callback(null, messageOrObject);
      },
    };
  }
}
