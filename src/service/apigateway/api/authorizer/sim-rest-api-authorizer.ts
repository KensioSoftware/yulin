import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimRestApiLambdaUri } from "../method/sim-rest-api-lambda-uri.js";
import type { SimRestApiIdentitySource } from "./sim-rest-api-identity-source.js";

/**
 * The id API Gateway allocates for one authorizer.
 */
export type SimRestApiAuthorizerId = Brand<string, "SimRestApiAuthorizerId">;

/**
 * The kinds of authorizer a REST API has, of which one is simulated.
 *
 * A `TOKEN` authorizer sends one header's value to a Lambda function and does
 * what the policy that function answers with says. `REQUEST` and
 * `COGNITO_USER_POOLS` are separate pieces of work, and an authorizer asking
 * for either is refused rather than created as something else.
 */
export type SimRestApiAuthorizerType = "TOKEN";

/**
 * What `GetAuthorizer` reports for the family an authorizer belongs to.
 *
 * A `TOKEN` or `REQUEST` authorizer is `custom`, and a Cognito one is
 * `cognito_user_pools`.
 */
export const simRestApiCustomAuthType = "custom";

/**
 * Allocate an authorizer id, in the same opaque shape as a resource id.
 */
export function makeSimRestApiAuthorizerId(): SimRestApiAuthorizerId {
  return faker.helpers.fromRegExp(/[a-z0-9]{6}/) as SimRestApiAuthorizerId;
}

/**
 * Minimal structural authorizer view, as the Create and Get commands return.
 */
export interface SimRestApiAuthorizerView {
  id: string;
  name: string;
  type: SimRestApiAuthorizerType;
  authType: string;
  authorizerUri: string;
  identitySource: string;
}

interface SimRestApiAuthorizerProperties {
  readonly authorizerId: SimRestApiAuthorizerId;
  readonly name: string;
  readonly lambdaUri: SimRestApiLambdaUri;
  readonly identitySource: SimRestApiIdentitySource;
}

/**
 * A simulated REST API `TOKEN` authorizer: the function a method sends a
 * request to before it reaches the integration.
 *
 * An authorizer belongs to an API and is attached to methods by id, so one
 * authorizer covers as many methods of the API as name it.
 *
 * The function decides, so nothing here says what a caller has to present.
 * All this holds is which function to invoke and which header carries the
 * token it is invoked with.
 */
export class SimRestApiAuthorizer {
  public readonly authorizerId: SimRestApiAuthorizerId;
  public readonly name: string;
  public readonly type: SimRestApiAuthorizerType = "TOKEN";

  /**
   * The Lambda function this authorizer invokes, read from its
   * `authorizerUri`.
   */
  public readonly lambdaUri: SimRestApiLambdaUri;

  /**
   * The header carrying the token, whose value is sent to the function as
   * `authorizationToken`.
   */
  public readonly identitySource: SimRestApiIdentitySource;

  constructor(properties: SimRestApiAuthorizerProperties) {
    this.authorizerId = properties.authorizerId;
    this.name = properties.name;
    this.lambdaUri = properties.lambdaUri;
    this.identitySource = properties.identitySource;
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
      identitySource: this.identitySource.expression,
    };
  }
}
