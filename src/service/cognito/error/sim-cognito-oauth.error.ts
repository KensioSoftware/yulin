import { SimCognitoError } from "./sim-cognito.error.js";

/**
 * The OAuth 2.0 error codes the hosted endpoints answer with.
 *
 * These are what a client library reads, so they are the real codes rather
 * than anything of this simulation's own. What is simulated and what is not is
 * said in the description alongside.
 */
export type SimCognitoOAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_scope"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "unsupported_response_type";

interface SimCognitoOAuthErrorProperties {
  readonly code: SimCognitoOAuthErrorCode;
  readonly description: string;

  /**
   * Whether the browser can be sent back to the application with this error.
   *
   * Real Cognito redirects an error to the app client's redirect URI once it
   * knows the request named a client and a URI that client registered, and
   * answers in the browser before that. Redirecting to a URI the request made
   * up would be an open redirect, which is why the two are not the same.
   */
  readonly redirectable: boolean;
}

/**
 * A refusal from one of a pool's hosted OAuth endpoints.
 *
 * The endpoints are not the Cognito API, so their refusals are not API
 * exceptions: an OAuth error is a code and a description, carried in a
 * redirect or in a JSON body depending on which endpoint refused.
 */
export class SimCognitoOAuthError extends SimCognitoError {
  public override readonly name = "OAuthError";
  public readonly code: SimCognitoOAuthErrorCode;
  public readonly description: string;
  public readonly redirectable: boolean;

  constructor(properties: SimCognitoOAuthErrorProperties) {
    super(`${properties.code}: ${properties.description}`, {
      httpStatusCode: 400,
    });

    this.code = properties.code;
    this.description = properties.description;
    this.redirectable = properties.redirectable;
  }
}

/**
 * Whether an error came from a hosted OAuth endpoint.
 */
export function isSimCognitoOAuthError(
  error: unknown,
): error is SimCognitoOAuthError {
  return error instanceof SimCognitoOAuthError;
}
