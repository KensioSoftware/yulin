import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";

/**
 * The API an `Auth` block was read from, for a refusal to name it.
 */
export interface SamApiAuthApi {
  /** `AWS::Serverless::Api` or `AWS::Serverless::HttpApi`. */
  readonly resourceType: string;
  /** The logical ID the API is expanded under. */
  readonly logicalId: string;
}

/**
 * One authorizer an API's `Auth` block declares, as the methods and routes it
 * decides need it.
 */
export interface SamApiAuthorizer {
  /** What a method or route naming this authorizer sets as its type. */
  readonly authorizationType: string;
  /**
   * The logical ID of the authorizer Resource, which a method or route names
   * by `Ref`. The built-in `AWS_IAM` authorizer has none: IAM itself decides,
   * and there is no authorizer to point at.
   */
  readonly logicalId: string | undefined;
  /** The scopes the authorizer asks of every method it decides. */
  readonly authorizationScopes: SimCfnTemplateValue | undefined;
  /** The Resources the authorizer is expanded into. */
  readonly resources: Record<string, SimCfnTemplateValue>;
}

/**
 * The `Auth` of one API, once expanded.
 *
 * Both API kinds arrive here. What differs between them is how one authorizer
 * becomes a Resource, and that is decided before this is built.
 */
export interface SamApiAuth {
  readonly api: SamApiAuthApi;
  /** The authorizers, by the name `Authorizers` declared each under. */
  readonly authorizers: ReadonlyMap<string, SamApiAuthorizer>;
  /** The authorizer every method takes when its event names none. */
  readonly defaultAuthorizer: string | undefined;
}

/**
 * The name SAM reserves for the authorizer IAM itself decides, on either API
 * kind.
 */
export const samIamAuthorizerName = "AWS_IAM";

/**
 * The name an event writes to open a method the API's `DefaultAuthorizer`
 * would otherwise have closed.
 */
export const samNoAuthorizerName = "NONE";
