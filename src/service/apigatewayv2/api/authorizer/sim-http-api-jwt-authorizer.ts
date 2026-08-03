import {
  SimHttpApiAuthorizer,
  type SimHttpApiAuthorizerId,
  type SimHttpApiAuthorizerView,
} from "./sim-http-api-authorizer.js";
import type { SimHttpApiIdentitySource } from "./identity/sim-http-api-identity-source.js";
import type { SimHttpApiJwtConfiguration } from "./sim-http-api-jwt-configuration.js";

interface SimHttpApiJwtAuthorizerProperties {
  readonly authorizerId: SimHttpApiAuthorizerId;
  readonly name: string;
  readonly identitySource: SimHttpApiIdentitySource;
  readonly jwtConfiguration: SimHttpApiJwtConfiguration;
}

/**
 * A simulated HTTP API JWT authorizer: which token a route asks for, and which
 * issuer signed it.
 *
 * There is one identity source rather than a list, which is what a JWT
 * authorizer takes: a token arrives in one place, and API Gateway refuses a
 * second source on this kind of authorizer.
 */
export class SimHttpApiJwtAuthorizer extends SimHttpApiAuthorizer {
  public readonly authorizerType = "JWT" as const;

  public readonly identitySource: SimHttpApiIdentitySource;
  public readonly jwtConfiguration: SimHttpApiJwtConfiguration;

  constructor(properties: SimHttpApiJwtAuthorizerProperties) {
    super(properties);
    this.identitySource = properties.identitySource;
    this.jwtConfiguration = properties.jwtConfiguration;
  }

  /**
   * Get the AWS-like view of this authorizer.
   */
  view(): SimHttpApiAuthorizerView {
    return {
      AuthorizerId: this.authorizerId,
      Name: this.name,
      AuthorizerType: this.authorizerType,
      IdentitySource: [this.identitySource.expression],
      JwtConfiguration: this.jwtConfiguration.view(),
    };
  }
}
