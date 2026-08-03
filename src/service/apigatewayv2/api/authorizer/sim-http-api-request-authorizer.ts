import type { SimHttpApiLambdaUri } from "../integration/sim-http-api-lambda-uri.js";
import type { SimHttpApiIdentitySources } from "./identity/sim-http-api-identity-sources.js";
import {
  SimHttpApiAuthorizer,
  type SimHttpApiAuthorizerId,
  type SimHttpApiAuthorizerView,
} from "./sim-http-api-authorizer.js";
import { SimHttpApiAuthorizerResultCache } from "./sim-http-api-authorizer-result-cache.js";

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
  readonly resultTtlSeconds: number;
}

/**
 * A simulated HTTP API Lambda `REQUEST` authorizer: the function a route sends
 * a request to before it reaches its integration.
 *
 * The function decides, so nothing here says what a caller has to present. All
 * this holds is which function to invoke, what has to be on the request before
 * it is worth invoking, which of the two answer shapes the function replies in,
 * and the decisions it has already made.
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

  /**
   * How long a decision is held for, in seconds, with zero meaning none.
   */
  public readonly resultTtlSeconds: number;

  /**
   * The decisions already made, which a request presenting the same identity
   * source values is served from rather than invoking the function again.
   */
  public readonly results: SimHttpApiAuthorizerResultCache;

  constructor(properties: SimHttpApiRequestAuthorizerProperties) {
    super(properties);
    this.lambdaUri = properties.lambdaUri;
    this.identitySources = properties.identitySources;
    this.enableSimpleResponses = properties.enableSimpleResponses;
    this.resultTtlSeconds = properties.resultTtlSeconds;
    this.results = new SimHttpApiAuthorizerResultCache(
      properties.resultTtlSeconds,
    );
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
      AuthorizerResultTtlInSeconds: this.resultTtlSeconds,
    };
  }
}
