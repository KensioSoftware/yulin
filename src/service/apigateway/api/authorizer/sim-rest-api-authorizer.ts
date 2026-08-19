import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimRestApiLambdaUri } from "../method/sim-rest-api-lambda-uri.js";
import type { SimRestApiIdentitySources } from "./identity/sim-rest-api-identity-sources.js";

/**
 * The id API Gateway allocates for one authorizer.
 */
export type SimRestApiAuthorizerId = Brand<string, "SimRestApiAuthorizerId">;

/**
 * The kinds of authorizer a REST API has, of which two are simulated.
 *
 * A `TOKEN` authorizer sends one header's value to a Lambda function. A
 * `REQUEST` authorizer sends the whole request to one instead, so it can
 * identify a caller by several headers together or by the query string. Both
 * do what the policy that function answers with says.
 *
 * `COGNITO_USER_POOLS` is a separate piece of work, and an authorizer asking
 * for it is refused rather than created as something else.
 */
export type SimRestApiAuthorizerType = "TOKEN" | "REQUEST";

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
  readonly type: SimRestApiAuthorizerType;
  readonly lambdaUri: SimRestApiLambdaUri;
  readonly identitySources: SimRestApiIdentitySources;
}

/**
 * A simulated REST API Lambda authorizer: the function a method sends a
 * request to before it reaches the integration.
 *
 * An authorizer belongs to an API and is attached to methods by id, so one
 * authorizer covers as many methods of the API as name it.
 *
 * The function decides, so nothing here says what a caller has to present.
 * All this holds is which function to invoke, what the request has to carry
 * before it is worth invoking, and how much of the request that function is
 * shown.
 */
export class SimRestApiAuthorizer {
  public readonly authorizerId: SimRestApiAuthorizerId;
  public readonly name: string;

  /**
   * How much of the request the function sees, which is the whole difference
   * between the two kinds.
   */
  public readonly type: SimRestApiAuthorizerType;

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

  constructor(properties: SimRestApiAuthorizerProperties) {
    this.authorizerId = properties.authorizerId;
    this.name = properties.name;
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
