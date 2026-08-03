import type { SimHttpApiLambdaUri } from "../integration/sim-http-api-lambda-uri.js";
import {
  SimHttpApiAuthorizer,
  type SimHttpApiAuthorizerId,
  type SimHttpApiAuthorizerView,
} from "./sim-http-api-authorizer.js";
import type { SimHttpApiIdentitySources } from "./sim-http-api-identity-sources.js";

/**
 * The only authorizer payload format simulated, which is the one the rest of
 * this simulation builds events in.
 */
export const simHttpApiAuthorizerPayloadFormatVersion = "2.0";

interface SimHttpApiRequestAuthorizerProperties {
  readonly authorizerId: SimHttpApiAuthorizerId;
  readonly name: string;
  readonly lambdaUri: SimHttpApiLambdaUri;
  readonly identitySources: SimHttpApiIdentitySources;
  readonly enableSimpleResponses: boolean;
}

/**
 * A simulated HTTP API Lambda `REQUEST` authorizer: the function a route sends
 * a request to before it reaches its integration.
 *
 * The function decides, so nothing here says what a caller has to present. All
 * this holds is which function to invoke, what has to be on the request before
 * it is worth invoking, and which of the two answer shapes the function
 * replies in.
 */
export class SimHttpApiRequestAuthorizer extends SimHttpApiAuthorizer {
  public readonly authorizerType = "REQUEST" as const;

  /**
   * The Lambda function this authorizer invokes, read from its
   * `AuthorizerUri`.
   */
  public readonly lambdaUri: SimHttpApiLambdaUri;

  public readonly identitySources: SimHttpApiIdentitySources;

  /**
   * Whether the function answers `{ isAuthorized, context }` rather than a
   * principal and an IAM policy document.
   */
  public readonly enableSimpleResponses: boolean;

  constructor(properties: SimHttpApiRequestAuthorizerProperties) {
    super(properties);
    this.lambdaUri = properties.lambdaUri;
    this.identitySources = properties.identitySources;
    this.enableSimpleResponses = properties.enableSimpleResponses;
  }

  /**
   * Get the AWS-like view of this authorizer.
   */
  view(): SimHttpApiAuthorizerView {
    return {
      AuthorizerId: this.authorizerId,
      Name: this.name,
      AuthorizerType: this.authorizerType,
      IdentitySource: this.identitySources.expressions,
      AuthorizerUri: this.lambdaUri.uri,
      AuthorizerPayloadFormatVersion: simHttpApiAuthorizerPayloadFormatVersion,
      EnableSimpleResponses: this.enableSimpleResponses,
    };
  }
}
