import type { SimPayload2JwtAuthorizer } from "../../../../serve/payload-2/sim-payload-2-event.type.js";

/**
 * Why an endpoint refused a request, which decides the response it gets.
 *
 * `unauthorized` covers everything up to and including claim validation: real
 * API Gateway answers all of it with one 401 and one body, so a client learns
 * that its token was not accepted and nothing about which check it failed.
 * `forbidden` is only ever an unmet route scope, which is a token that was
 * accepted and does not allow this route.
 */
export type SimHttpApiRefusalKind = "unauthorized" | "forbidden";

/**
 * A request the endpoint admitted, and what its authorizer knows about the
 * caller.
 *
 * `jwt` is absent on a route that authorizes nobody, since there is no caller
 * to describe, which is what leaves `requestContext.authorizer` out of the
 * event entirely.
 */
export class SimHttpApiAdmitted {
  public readonly admitted = true as const;
  public readonly jwt: SimPayload2JwtAuthorizer | undefined;

  constructor(jwt?: SimPayload2JwtAuthorizer) {
    this.jwt = jwt;
  }
}

/**
 * A request the endpoint refused, before any integration was invoked.
 *
 * `errorDescription` is the one AWS publishes for a token whose audience does
 * not match, and is absent everywhere else rather than filled in with text
 * AWS was not seen to send.
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
   * The token was missing, unreadable, or did not verify.
   */
  static unauthorized(errorDescription?: string): SimHttpApiRefused {
    return new SimHttpApiRefused("unauthorized", errorDescription);
  }

  /**
   * The token verified, and none of its scopes is one the route asks for.
   */
  static forbidden(): SimHttpApiRefused {
    return new SimHttpApiRefused("forbidden");
  }
}

/**
 * What an endpoint decided about one request.
 */
export type SimHttpApiAuthorization = SimHttpApiAdmitted | SimHttpApiRefused;
