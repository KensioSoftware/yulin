import { SimCognitoError } from "./sim-cognito.error.js";

/**
 * Simulated Cognito TooManyRequestsException error.
 *
 * Real Cognito answers this when a pool has turned a request away for rate
 * limiting. Its own limits belong to the account and are mostly undocumented.
 * Working one out here would be inventing a number, so a test says how many
 * requests a pool should turn away and the pool turns away that many.
 */
export class SimCognitoTooManyRequestsException extends SimCognitoError {
  public override readonly name = "TooManyRequestsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
