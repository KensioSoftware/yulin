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
  /** The version the invocation is running, which is `$LATEST` or a number. */
  readonly functionVersion: string;
  readonly invokedFunctionArn: string;
  readonly timeoutSeconds: number;
  readonly memorySizeMb: number;
  readonly logGroupName: string;

  /** The stream this invocation's execution environment writes to. */
  readonly logStreamName: string;
  /**
   * Clock measuring how much of the invocation timeout is left. Reading the
   * remaining time from the simulation's clock means a stopped clock leaves a
   * handler with a constant budget, rather than one that drains in real time.
   */
  readonly clock?: SimClock | undefined;

  /**
   * The request id this invocation is known by. It comes from outside because
   * the invocation names itself in the error it reports when it runs out of
   * time, and a handler reading `awsRequestId` has to see the same one.
   */
  readonly awsRequestId?: string | undefined;
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
      functionVersion,
      invokedFunctionArn,
      timeoutSeconds,
      memorySizeMb,
      logGroupName,
      logStreamName,
      clock = new SimRealClock(),
      awsRequestId = randomUUID(),
    } = this.properties;
    const startedAtMs = clock.now().getTime();

    return {
      callbackWaitsForEmptyEventLoop: true,
      functionName,
      functionVersion,
      invokedFunctionArn,
      memoryLimitInMB: String(memorySizeMb),
      awsRequestId,
      logGroupName,
      logStreamName,
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
