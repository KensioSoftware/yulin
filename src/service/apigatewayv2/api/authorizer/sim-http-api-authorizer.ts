import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimHttpApiJwtConfigurationView } from "./sim-http-api-jwt-configuration.js";

/**
 * The id API Gateway allocates for one authorizer.
 */
export type SimHttpApiAuthorizerId = Brand<string, "SimHttpApiAuthorizerId">;

/**
 * The two kinds of authorizer an HTTP API has.
 *
 * A `JWT` authorizer verifies a token against the keys its issuer publishes. A
 * `REQUEST` authorizer invokes a Lambda function of its own and does whatever
 * that function decides.
 */
export type SimHttpApiAuthorizerType = "JWT" | "REQUEST";

/**
 * Allocate an authorizer id, in the same opaque shape as a route id.
 */
export function makeSimHttpApiAuthorizerId(): SimHttpApiAuthorizerId {
  return faker.helpers.fromRegExp(/[a-z0-9]{6}/) as SimHttpApiAuthorizerId;
}

interface SimHttpApiAuthorizerProperties {
  readonly authorizerId: SimHttpApiAuthorizerId;
  readonly name: string;
}

/**
 * Minimal structural authorizer view, as the Create and Get commands return.
 *
 * The members below the identity sources belong to one kind of authorizer
 * each, and only the kind that has them reports them, which is what real API
 * Gateway answers with.
 */
export interface SimHttpApiAuthorizerView {
  AuthorizerId: string;
  Name: string;
  AuthorizerType: SimHttpApiAuthorizerType;
  IdentitySource: string[];
  JwtConfiguration?: SimHttpApiJwtConfigurationView;
  AuthorizerUri?: string;
  AuthorizerPayloadFormatVersion?: string;
  EnableSimpleResponses?: boolean;
  AuthorizerResultTtlInSeconds?: number;
}

/**
 * A simulated HTTP API authorizer: what a route sends a request through before
 * it reaches an integration.
 *
 * An authorizer belongs to an API and is attached to routes by id, so one
 * authorizer covers as many routes of the API as name it. What it does with a
 * request is the subclass's business: the two kinds share an id, a name and
 * nothing else.
 */
export abstract class SimHttpApiAuthorizer {
  public readonly authorizerId: SimHttpApiAuthorizerId;
  public readonly name: string;

  /**
   * The kind of authorizer this is, which is what a route's own authorization
   * type has to agree with.
   */
  abstract readonly authorizerType: SimHttpApiAuthorizerType;

  constructor(properties: SimHttpApiAuthorizerProperties) {
    this.authorizerId = properties.authorizerId;
    this.name = properties.name;
  }

  /**
   * Get the AWS-like view of this authorizer.
   */
  abstract view(): SimHttpApiAuthorizerView;
}
