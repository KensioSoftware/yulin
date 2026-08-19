import type {
  SimPayload1CognitoAuthorizer,
  SimPayload1LambdaAuthorizer,
} from "../../../../serve/payload-1/sim-payload-1-event.type.js";
import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";

/**
 * Why a method refused a request, which decides the response it gets.
 *
 * `unauthorized` is a request carrying no token at the authorizer's identity
 * source, and a token the authorizer answered `Unauthorized` for.
 * `explicit-deny` and `implicit-deny` are both 403 with different bodies, as
 * real API Gateway answers them. `error` is the authorizer itself failing,
 * which is the API's problem rather than the caller's.
 */
export type SimRestApiRefusalKind =
  | "unauthorized"
  | "explicit-deny"
  | "implicit-deny"
  | "error";

interface SimRestApiAdmittedProperties {
  /**
   * What a `CUSTOM` method's authorizer passed on to the integration, which is
   * absent on a method admitting anybody.
   */
  readonly lambda?: SimPayload1LambdaAuthorizer | undefined;
  /** The principal an `AWS_IAM` method allowed the request. */
  readonly caller?: SimAwsRequestCaller | undefined;
  /**
   * The claims of the token a `COGNITO_USER_POOLS` method's authorizer
   * accepted.
   */
  readonly cognito?: SimPayload1CognitoAuthorizer | undefined;
}

/**
 * A request the method admitted, and what its authorization knows about the
 * caller.
 *
 * Every member is absent on a method that authorizes nobody, since there is
 * no caller to describe. That is what leaves `requestContext.authorizer` out of
 * the event entirely and every `requestContext.identity` field describing a
 * principal `null`. Which one is present says which kind of authorization
 * admitted the request.
 */
export class SimRestApiAdmitted {
  public readonly admitted = true as const;
  public readonly lambda: SimPayload1LambdaAuthorizer | undefined;
  public readonly caller: SimAwsRequestCaller | undefined;
  public readonly cognito: SimPayload1CognitoAuthorizer | undefined;

  constructor(properties: SimRestApiAdmittedProperties = {}) {
    this.lambda = properties.lambda;
    this.caller = properties.caller;
    this.cognito = properties.cognito;
  }
}

/**
 * A request the method refused, before any integration was invoked.
 */
export class SimRestApiRefused {
  public readonly admitted = false as const;
  public readonly kind: SimRestApiRefusalKind;

  private constructor(kind: SimRestApiRefusalKind) {
    this.kind = kind;
  }

  /**
   * The request carried nothing at the authorizer's identity source, or the
   * authorizer answered `Unauthorized`.
   */
  static unauthorized(): SimRestApiRefused {
    return new SimRestApiRefused("unauthorized");
  }

  /**
   * A Deny statement in the authorizer's policy matched the method.
   */
  static explicitDeny(): SimRestApiRefused {
    return new SimRestApiRefused("explicit-deny");
  }

  /**
   * The authorizer's policy allowed nothing that covers the method.
   */
  static implicitDeny(): SimRestApiRefused {
    return new SimRestApiRefused("implicit-deny");
  }

  /**
   * The method's authorizer could not answer at all. Its function is missing,
   * may not be invoked, failed, or replied in a shape API Gateway does not
   * understand. None of that is the caller's doing, so it is the 500 an
   * authorizer failure gets on real AWS.
   */
  static error(): SimRestApiRefused {
    return new SimRestApiRefused("error");
  }
}

/**
 * What a method decided about one request.
 */
export type SimRestApiAuthorization = SimRestApiAdmitted | SimRestApiRefused;
