import type { SimHttpApiAuthorizerId } from "../../api/authorizer/sim-http-api-authorizer.js";
import type { SimHttpApiAuthorizationType } from "../../api/route/sim-http-api-route.js";
import { SimHttpApiRouteScopes } from "../../api/route/sim-http-api-route-scopes.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import type { SimCreateRouteCommandInput } from "./route.command.js";

/**
 * How a route says who may call it.
 */
export interface SimHttpApiRouteAuthorization {
  readonly authorizationType: SimHttpApiAuthorizationType;
  readonly authorizerId?: SimHttpApiAuthorizerId | undefined;
  readonly authorizationScopes: SimHttpApiRouteScopes;
}

/**
 * Reads the authorization a CreateRoute input asks for, against the API it is
 * being created on.
 *
 * A `JWT` route has to name an authorizer the API has. A route deploying with
 * an `AuthorizerId` that resolved to nothing would be open here and closed on
 * AWS, which is the failure this whole area exists to avoid, so it is refused
 * rather than created.
 */
export class SimHttpApiRouteAuthorizationInput {
  private readonly input: SimCreateRouteCommandInput;

  constructor(input: SimCreateRouteCommandInput) {
    this.input = input;
  }

  /**
   * The authorization this route is created with.
   */
  read(api: SimHttpApi): SimHttpApiRouteAuthorization {
    const authorizationType = this.input.AuthorizationType ?? "NONE";

    if (authorizationType === "NONE") {
      return this.open();
    }

    if (authorizationType === "AWS_IAM") {
      return this.iam();
    }

    return {
      authorizationType: "JWT",
      authorizerId: this.authorizer(api),
      authorizationScopes: new SimHttpApiRouteScopes(
        this.input.AuthorizationScopes ?? [],
      ),
    };
  }

  /**
   * A route anyone may call, which is what a route says by leaving
   * `AuthorizationType` out.
   */
  private open(): SimHttpApiRouteAuthorization {
    this.refuseAuthorizerId(
      "NONE",
      "which would be ignored here and would leave the route open on AWS too",
    );
    this.refuseAuthorizationScopes(
      "NONE",
      "and nothing checks a scope on a route that authorizes nobody",
    );

    return {
      authorizationType: "NONE",
      authorizationScopes: new SimHttpApiRouteScopes(),
    };
  }

  /**
   * A route IAM decides, which takes neither an authorizer nor scopes.
   *
   * Refusing scopes is stricter than AWS, which documents route scopes as
   * meaningful only for `JWT` and ignores them for `AWS_IAM`. Accepting them
   * here would let a test assert on a scope restriction that nothing applies.
   */
  private iam(): SimHttpApiRouteAuthorization {
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

    return {
      authorizationType: "AWS_IAM",
      authorizationScopes: new SimHttpApiRouteScopes(),
    };
  }

  /**
   * Refuse an `AuthorizerId` on an authorization type that takes none.
   */
  private refuseAuthorizerId(authorizationType: string, reason: string): void {
    if (this.input.AuthorizerId === undefined) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `CreateRoute AuthorizerId is set on a route with AuthorizationType ` +
        `${authorizationType}, ${reason}`,
    );
  }

  /**
   * Refuse `AuthorizationScopes` on an authorization type that checks none.
   */
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

  private authorizer(api: SimHttpApi): SimHttpApiAuthorizerId {
    const authorizerId = this.input.AuthorizerId;

    if (authorizerId === undefined || authorizerId.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateRoute with AuthorizationType JWT requires AuthorizerId",
      );
    }

    const authorizer = api.authorizers.find(authorizerId);

    if (authorizer === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `CreateRoute AuthorizerId ${authorizerId} names no authorizer on ` +
          `API ${api.apiId}. The route would be open here and closed on AWS.`,
      );
    }

    return authorizer.authorizerId;
  }
}
