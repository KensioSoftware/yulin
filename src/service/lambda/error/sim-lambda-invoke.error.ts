import { SimLambdaError } from "./sim-lambda.error.js";

/**
 * Simulated Lambda RequestTooLargeException error.
 *
 * Real Lambda refuses an Invoke whose payload is larger than the invocation
 * type allows this way: 6 MB for a synchronous invocation, 1 MB for an
 * asynchronous one.
 */
export class SimLambdaRequestTooLargeException extends SimLambdaError {
  public override readonly name = "RequestTooLargeException";

  constructor(message: string) {
    super(message, { httpStatusCode: 413 });
  }
}

/**
 * Simulated Lambda RecursiveInvocationException error.
 *
 * Real Lambda stops an invocation this way once the event it carries has gone
 * round a loop between Lambda, SQS, SNS and S3 more than 16 times.
 */
export class SimLambdaRecursiveInvocationException extends SimLambdaError {
  public override readonly name = "RecursiveInvocationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
