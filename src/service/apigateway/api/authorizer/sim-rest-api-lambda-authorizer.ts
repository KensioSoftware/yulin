import type { SimRestApiLambdaUri } from "../method/sim-rest-api-lambda-uri.js";
import type { SimRestApiIdentitySources } from "./identity/sim-rest-api-identity-sources.js";
import {
  SimRestApiAuthorizer,
  type SimRestApiAuthorizerId,
  type SimRestApiAuthorizerView,
  simRestApiCustomAuthType,
} from "./sim-rest-api-authorizer.js";

/**
 * The kinds of authorizer that decide by invoking a function.
 */
export type SimRestApiLambdaAuthorizerType = "TOKEN" | "REQUEST";

interface SimRestApiLambdaAuthorizerProperties {
  readonly authorizerId: SimRestApiAuthorizerId;
  readonly name: string;
  readonly type: SimRestApiLambdaAuthorizerType;
  readonly lambdaUri: SimRestApiLambdaUri;
  readonly identitySources: SimRestApiIdentitySources;
}

/**
 * A simulated REST API Lambda authorizer: the function a method sends a
 * request to before it reaches the integration.
 *
 * The function decides, so nothing here says what a caller has to present.
 * All this holds is which function to invoke, what the request has to carry
 * before it is worth invoking, and how much of the request that function is
 * shown.
 */
export class SimRestApiLambdaAuthorizer extends SimRestApiAuthorizer {
  /**
   * How much of the request the function sees, which is the whole difference
   * between the two kinds.
   */
  public readonly type: SimRestApiLambdaAuthorizerType;

  /**
   * The Lambda function this authorizer invokes, read from its
   * `authorizerUri`.
   */
  public readonly lambdaUri: SimRestApiLambdaUri;

  /**
   * Where the request has to carry something for the function to be invoked at
   * all. A `TOKEN` authorizer has exactly one, and its value is the token the
   * function is invoked with.
   */
  public readonly identitySources: SimRestApiIdentitySources;

  constructor(properties: SimRestApiLambdaAuthorizerProperties) {
    super(properties);
    this.type = properties.type;
    this.lambdaUri = properties.lambdaUri;
    this.identitySources = properties.identitySources;
  }

  /**
   * Get the AWS-like view of this authorizer.
   */
  view(): SimRestApiAuthorizerView {
    return {
      id: this.authorizerId,
      name: this.name,
      type: this.type,
      authType: simRestApiCustomAuthType,
      authorizerUri: this.lambdaUri.uri,
      identitySource: this.identitySources.expression,
    };
  }
}
