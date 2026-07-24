import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

/**
 * Executable code backing a sim Lambda function.
 *
 * Getting the handler function may throw an AWS-like Runtime.* error, as a
 * real Lambda cold start surfaces module import and handler lookup problems
 * at invocation time rather than at function creation.
 */
export interface SimLambdaExecutableCode {
  handlerFunction(): SimLambdaHandler;
}

/**
 * Executable code backed directly by a real handler function reference.
 */
export class SimLambdaHandlerReferenceCode implements SimLambdaExecutableCode {
  constructor(private readonly handler: SimLambdaHandler) {}

  /**
   * Get the referenced handler function.
   */
  handlerFunction(): SimLambdaHandler {
    return this.handler;
  }
}
