import { randomUUID } from "node:crypto";
import type {
  SimLambdaCallback,
  SimLambdaContext,
} from "../sim-lambda-handler.type.js";

interface SimLambdaInvokeContextBuilderProperties {
  readonly functionName: string;
  readonly invokedFunctionArn: string;
  readonly timeoutSeconds: number;
  readonly memorySizeMb: number;
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
    const { functionName, invokedFunctionArn, timeoutSeconds, memorySizeMb } =
      this.properties;
    const startedAtMs = Date.now();
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
        Math.max(0, timeoutSeconds * 1000 - (Date.now() - startedAtMs)),
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
