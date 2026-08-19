import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";

/**
 * The id API Gateway allocates for one authorizer.
 */
export type SimRestApiAuthorizerId = Brand<string, "SimRestApiAuthorizerId">;

/**
 * The kinds of authorizer a REST API has.
 *
 * A `TOKEN` authorizer sends one header's value to a Lambda function. A
 * `REQUEST` authorizer sends the whole request to one instead, so it can
 * identify a caller by several headers together or by the query string. Both
 * do what the policy that function answers with says. A `COGNITO_USER_POOLS`
 * authorizer invokes nothing and verifies the token against the user pools it
 * names.
 */
export type SimRestApiAuthorizerType =
  | "TOKEN"
  | "REQUEST"
  | "COGNITO_USER_POOLS";

/**
 * What `GetAuthorizer` reports for the family a Lambda authorizer belongs to.
 *
 * A `TOKEN` or `REQUEST` authorizer is `custom`.
 */
export const simRestApiCustomAuthType = "custom";

/**
 * What `GetAuthorizer` reports for the family a Cognito authorizer belongs to.
 */
export const simRestApiCognitoAuthType = "cognito_user_pools";

/**
 * Allocate an authorizer id, in the same opaque shape as a resource id.
 */
export function makeSimRestApiAuthorizerId(): SimRestApiAuthorizerId {
  return faker.helpers.fromRegExp(/[a-z0-9]{6}/) as SimRestApiAuthorizerId;
}

/**
 * Minimal structural authorizer view, as the Create and Get commands return.
 *
 * `authorizerUri` and `providerARNs` belong to one kind of authorizer each, so
 * each view carries the one its kind has.
 */
export interface SimRestApiAuthorizerView {
  id: string;
  name: string;
  type: SimRestApiAuthorizerType;
  authType: string;
  identitySource: string;
  authorizerUri?: string;
  providerARNs?: string[];
}

interface SimRestApiAuthorizerProperties {
  readonly authorizerId: SimRestApiAuthorizerId;
  readonly name: string;
}

/**
 * A simulated REST API authorizer: what a method sends a request through
 * before it reaches the integration.
 *
 * An authorizer belongs to an API and is attached to methods by id, so one
 * authorizer covers as many methods of the API as name it. What it does with
 * a request is its kind's business, and that is all the subclasses are.
 */
export abstract class SimRestApiAuthorizer {
  public readonly authorizerId: SimRestApiAuthorizerId;
  public readonly name: string;

  /**
   * Which kind of authorizer this is, which is also what decides whether a
   * method may name it.
   */
  public abstract readonly type: SimRestApiAuthorizerType;

  protected constructor(properties: SimRestApiAuthorizerProperties) {
    this.authorizerId = properties.authorizerId;
    this.name = properties.name;
  }

  /**
   * Get the AWS-like view of this authorizer.
   */
  abstract view(): SimRestApiAuthorizerView;
}
