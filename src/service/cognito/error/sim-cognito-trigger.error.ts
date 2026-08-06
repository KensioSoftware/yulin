import { SimCognitoError } from "./sim-cognito.error.js";

/**
 * Simulated Cognito UserLambdaValidationException error.
 *
 * Real Cognito reports a Lambda trigger that threw this way, wrapping the
 * handler's own message in a sentence naming the trigger that ran. That is the
 * whole point of the error: a `PreAuthentication` handler refusing a sign-in
 * does it by throwing, and the message it threw is what tells the caller why.
 */
export class SimCognitoUserLambdaValidationException extends SimCognitoError {
  public override readonly name = "UserLambdaValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito UnexpectedLambdaException error.
 *
 * Real Cognito reports a trigger it could not invoke at all this way: the
 * function is not there, or its resource policy does not admit
 * `cognito-idp.amazonaws.com`. The handler never ran, so there is no message of
 * its own to carry, and this simulation says which of the two happened instead
 * of the bare "Unexpected exception" real Cognito answers with.
 */
export class SimCognitoUnexpectedLambdaException extends SimCognitoError {
  public override readonly name = "UnexpectedLambdaException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito InvalidLambdaResponseException error.
 *
 * Real Cognito reports a trigger that returned something it could not read this
 * way. A trigger handler is given the event and has to return it, so a handler
 * that returns nothing, or an object without the `request` it was handed, has
 * dropped the event rather than answered with it.
 */
export class SimCognitoInvalidLambdaResponseException extends SimCognitoError {
  public override readonly name = "InvalidLambdaResponseException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
