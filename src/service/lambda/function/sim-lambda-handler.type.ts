/**
 * Minimal structural sim Lambda invocation context.
 *
 * Structurally compatible with the Context type from the aws-lambda typings
 * package, so real typed Lambda handler functions can be passed to the
 * simulator without adapting their signatures.
 */
export interface SimLambdaContext {
  callbackWaitsForEmptyEventLoop: boolean;
  readonly functionName: string;
  readonly functionVersion: string;
  readonly invokedFunctionArn: string;
  readonly memoryLimitInMB: string;
  readonly awsRequestId: string;
  readonly logGroupName: string;
  readonly logStreamName: string;

  getRemainingTimeInMillis(): number;

  done(error?: Error, result?: unknown): void;
  fail(error: Error | string): void;
  succeed(messageOrObject: unknown): void;
}

/**
 * Completion callback for callback-style sim Lambda handler functions.
 */
export type SimLambdaCallback<TResult = unknown> = (
  error?: Error | string | null,
  result?: TResult,
) => void;

/**
 * A real handler function backing a sim Lambda function.
 *
 * Mirrors the Handler type from the aws-lambda typings package: the handler
 * may complete by returning a Promise or by calling the callback. The
 * simulator additionally accepts a plain synchronous return value from a
 * handler that does not declare the callback parameter.
 */
export type SimLambdaHandler<TEvent = never, TResult = unknown> = (
  event: TEvent,
  context: SimLambdaContext,
  callback: SimLambdaCallback<TResult>,
  // The void return type constituent mirrors the aws-lambda Handler type, so
  // real callback-style handler references remain assignable.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => void | TResult | Promise<TResult>;

/**
 * Default sim Lambda handler function: echoes the invocation event back.
 */
export const defaultLambdaHandler: SimLambdaHandler = (event) => {
  return Promise.resolve(event);
};
