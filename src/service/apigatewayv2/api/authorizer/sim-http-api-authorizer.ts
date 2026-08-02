import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimHttpApiIdentitySource } from "./sim-http-api-identity-source.js";
import type {
  SimHttpApiJwtConfiguration,
  SimHttpApiJwtConfigurationView,
} from "./sim-http-api-jwt-configuration.js";

/**
 * The id API Gateway allocates for one authorizer.
 */
export type SimHttpApiAuthorizerId = Brand<string, "SimHttpApiAuthorizerId">;

/**
 * The only authorizer type simulated.
 *
 * A Lambda `REQUEST` authorizer runs code of its own to make the decision, and
 * none of that is simulated, so it is refused at creation rather than created
 * and ignored.
 */
export type SimHttpApiAuthorizerType = "JWT";

/**
 * Allocate an authorizer id, in the same opaque shape as a route id.
 */
export function makeSimHttpApiAuthorizerId(): SimHttpApiAuthorizerId {
  return faker.helpers.fromRegExp(/[a-z0-9]{6}/) as SimHttpApiAuthorizerId;
}

interface SimHttpApiAuthorizerProperties {
  readonly authorizerId: SimHttpApiAuthorizerId;
  readonly name: string;
  readonly identitySource: SimHttpApiIdentitySource;
  readonly jwtConfiguration: SimHttpApiJwtConfiguration;
}

/**
 * Minimal structural authorizer view, as the Create and Get commands return.
 */
export interface SimHttpApiAuthorizerView {
  AuthorizerId: string;
  Name: string;
  AuthorizerType: SimHttpApiAuthorizerType;
  IdentitySource: string[];
  JwtConfiguration: SimHttpApiJwtConfigurationView;
}

/**
 * A simulated HTTP API JWT authorizer: which token a route asks for, and which
 * issuer signed it.
 *
 * An authorizer belongs to an API and is attached to routes by id, so one
 * authorizer covers as many routes of the API as name it.
 */
export class SimHttpApiAuthorizer {
  /**
   * The type of authorizer this is, which is the only one simulated.
   */
  public readonly authorizerType: SimHttpApiAuthorizerType = "JWT";

  public readonly authorizerId: SimHttpApiAuthorizerId;
  public readonly name: string;
  public readonly identitySource: SimHttpApiIdentitySource;
  public readonly jwtConfiguration: SimHttpApiJwtConfiguration;

  constructor(properties: SimHttpApiAuthorizerProperties) {
    this.authorizerId = properties.authorizerId;
    this.name = properties.name;
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
