/**
 * A pool asking to reach the function one of its triggers names.
 *
 * The pool ARN and the Account that owns it travel with every request because
 * they are what the function's resource policy is written against: real Cognito
 * invokes with the pool as the source ARN, so a permission granted for one pool
 * does not open the function to another.
 */
export interface SimCognitoTriggerFunctionRequest {
  readonly functionArn: string;
  readonly userPoolArn: string;
  readonly userPoolAccountId: string;
}

/**
 * The narrow slice of simulated Lambda that a Cognito user pool trigger needs.
 *
 * A pool asks two things of a function: whether it may invoke it, and then to
 * invoke it and hand back what the handler returned. Both are asked by ARN,
 * because a `LambdaConfig` names a function by ARN and that ARN can name
 * another Account or Region.
 *
 * The invocation is synchronous and its result is read, which is what makes
 * these triggers different from an event notification: the handler's return
 * value is the event the pool goes on with, and a handler that throws refuses
 * the sign-in.
 */
export interface SimCognitoTriggerFunctions {
  /**
   * Why the pool may not invoke the function, or nothing when it may.
   *
   * A reason rather than a boolean, because it is repeated back in the
   * `UnexpectedLambdaException` whoever has to grant the permission reads.
   */
  invokeRefusal(request: SimCognitoTriggerFunctionRequest): string | undefined;

  /**
   * Invoke the function with the trigger event, answering with whatever the
   * handler returned.
   */
  invoke(
    request: SimCognitoTriggerFunctionRequest,
    event: object,
  ): Promise<unknown>;
}

/**
 * The trigger functions of a simulated Cognito built without simulated Lambda,
 * such as a standalone SimCognitoIdentityProvider constructed outside SimAws.
 *
 * A pool can still be created with a `LambdaConfig`, because the function is
 * only resolved when a trigger fires. It is the sign-in that says there is no
 * Lambda to reach, rather than the pool creation that would have to guess.
 */
export class SimCognitoNoTriggerFunctions implements SimCognitoTriggerFunctions {
  /**
   * Refuse the invocation, explaining how to reach a function.
   */
  invokeRefusal(request: SimCognitoTriggerFunctionRequest): string {
    return (
      `${request.functionArn} cannot be reached: this ` +
      `SimCognitoIdentityProvider was built without simulated Lambda. Reach ` +
      `Cognito through SimAws to run a user pool trigger.`
    );
  }

  /**
   * Refuse to invoke, for the same reason.
   */
  invoke(request: SimCognitoTriggerFunctionRequest): Promise<unknown> {
    return Promise.reject(new Error(this.invokeRefusal(request)));
  }
}
