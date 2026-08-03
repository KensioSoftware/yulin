import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import type { SimCreateRouteCommandInput } from "./route.command.js";

/**
 * Refuses the options a route's authorization type has no use for.
 *
 * An authorizer nothing would ask, or a scope nothing would check, is refused
 * rather than stored, so a route cannot report a restriction that applies to
 * none of its requests. Refusing scopes anywhere but on a `JWT` route is
 * stricter than AWS, which documents route scopes as meaningful only there and
 * ignores them elsewhere. Accepting them would let a test assert on a scope
 * restriction that nothing applies.
 */
export class SimHttpApiRouteAuthorizationOptions {
  private readonly input: SimCreateRouteCommandInput;

  constructor(input: SimCreateRouteCommandInput) {
    this.input = input;
  }

  /**
   * Refuse what a route that authorizes nobody has no use for.
   */
  refuseOnOpenRoute(): void {
    this.refuseAuthorizerId(
      "NONE",
      "which would be ignored here and would leave the route open on AWS too",
    );
    this.refuseAuthorizationScopes(
      "NONE",
      "and nothing checks a scope on a route that authorizes nobody",
    );
  }

  /**
   * Refuse what a route IAM decides has no use for.
   */
  refuseOnIamRoute(): void {
    this.refuseAuthorizerId(
      "AWS_IAM",
      "and IAM itself decides an AWS_IAM route, so there is no authorizer to " +
        "send the request through",
    );
    this.refuseAuthorizationScopes(
      "AWS_IAM",
      "and AWS applies route scopes to a JWT route only, so a scope written " +
        "here would restrict nothing",
    );
  }

  /**
   * Refuse what a route a Lambda authorizer decides has no use for.
   */
  refuseOnCustomRoute(): void {
    this.refuseAuthorizationScopes(
      "CUSTOM",
      "and AWS applies route scopes to a JWT route only: what a Lambda " +
        "authorizer accepts is the function's own business",
    );
  }

  private refuseAuthorizerId(authorizationType: string, reason: string): void {
    if (this.input.AuthorizerId === undefined) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `CreateRoute AuthorizerId is set on a route with AuthorizationType ` +
        `${authorizationType}, ${reason}`,
    );
  }

  private refuseAuthorizationScopes(
    authorizationType: string,
    reason: string,
  ): void {
    if ((this.input.AuthorizationScopes ?? []).length === 0) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `CreateRoute AuthorizationScopes is set on a route with ` +
        `AuthorizationType ${authorizationType}, ${reason}`,
    );
  }
}
