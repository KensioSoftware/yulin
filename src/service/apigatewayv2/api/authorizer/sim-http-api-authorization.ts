import type {
  SimPayload2JwtAuthorizer,
  SimPayload2LambdaAuthorizer,
} from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";

/**
 * Why an endpoint refused a request, which decides the response it gets.
 *
 * `unauthorized` covers everything up to and including claim validation: real
 * API Gateway answers all of it with one 401 and one body, so a client learns
 * that its token was not accepted and nothing about which check it failed.
 * `forbidden` is an accepted caller the route does not allow, such as an unmet
 * route scope or an authorizer that said no. `error` is the authorizer itself
 * failing, which is the API's problem rather than the caller's.
 */
export type SimHttpApiRefusalKind = "unauthorized" | "forbidden" | "error";

interface SimHttpApiAdmittedProperties {
  /** The token a `JWT` route's authorizer accepted. */
  readonly jwt?: SimPayload2JwtAuthorizer | undefined;
  /** The principal an `AWS_IAM` route allowed the request. */
  readonly caller?: SimAwsRequestCaller | undefined;
  /**
   * What a `CUSTOM` route's Lambda authorizer passed on to the integration,
   * which is `null` when it allowed the request and returned no context.
   */
  readonly lambda?: SimPayload2LambdaAuthorizer | null | undefined;
}

/**
 * A request the endpoint admitted, and what its authorizer knows about the
 * caller.
 *
 * Every member is absent on a route that authorizes nobody, since there is no
 * caller to describe, which is what leaves `requestContext.authorizer` out of
 * the event entirely. Which one is present says which kind of authorization
 * admitted the request.
 */
export class SimHttpApiAdmitted {
  public readonly admitted = true as const;
  public readonly jwt: SimPayload2JwtAuthorizer | undefined;
  public readonly caller: SimAwsRequestCaller | undefined;
  public readonly lambda: SimPayload2LambdaAuthorizer | null | undefined;

  constructor(properties: SimHttpApiAdmittedProperties = {}) {
    this.jwt = properties.jwt;
    this.caller = properties.caller;
    this.lambda = properties.lambda;
  }
}

/**
 * A request the endpoint refused, before any integration was invoked.
 *
 * `errorDescription` is the one AWS publishes for a token whose audience does
 * not match, and is absent everywhere else rather than filled in with text
 * AWS was not seen to send.
 *
 * An `AWS_IAM` route refuses with `forbidden`, whoever the caller turned out
 * to be: nothing about an unsigned request makes it a 401 here, because the
 * boundary already resolved it to an anonymous caller and IAM then allows that
 * caller nothing.
 */
export class SimHttpApiRefused {
  public readonly admitted = false as const;
  public readonly kind: SimHttpApiRefusalKind;
  public readonly errorDescription: string | undefined;

  private constructor(kind: SimHttpApiRefusalKind, errorDescription?: string) {
    this.kind = kind;
    this.errorDescription = errorDescription;
  }

  /**
   * The token was missing, unreadable, or did not verify, or the request did
   * not carry an identity source a Lambda authorizer was told to read.
   */
  static unauthorized(errorDescription?: string): SimHttpApiRefused {
    return new SimHttpApiRefused("unauthorized", errorDescription);
  }

  /**
   * The token verified and none of its scopes is one the route asks for, IAM
   * did not allow the caller `execute-api:Invoke` on the route, or a Lambda
   * authorizer decided against the request.
   */
  static forbidden(): SimHttpApiRefused {
    return new SimHttpApiRefused("forbidden");
  }

  /**
   * The route's authorizer could not answer at all: its function is missing,
   * may not be invoked, failed, or replied in a shape API Gateway does not
   * understand. None of that is the caller's doing, so it is the same 500 an
   * integration failure gets rather than a refusal the caller could act on.
   */
  static error(): SimHttpApiRefused {
    return new SimHttpApiRefused("error");
  }
}

/**
 * What an endpoint decided about one request.
 */
export type SimHttpApiAuthorization = SimHttpApiAdmitted | SimHttpApiRefused;
