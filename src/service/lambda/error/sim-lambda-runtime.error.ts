/**
 * A sim Lambda function runtime error, as raised by the simulated runtime
 * rather than the sim Lambda control-plane API.
 *
 * The error name mirrors the AWS-style runtime errorType, such as
 * Runtime.ImportModuleError or Runtime.HandlerNotFound, so invocation error
 * payloads report the same errorType as the real Node.js Lambda runtime.
 */
export class SimLambdaRuntimeError extends Error {
  constructor(
    public override readonly name: string,
    message: string,
  ) {
    super(message);
  }
}
