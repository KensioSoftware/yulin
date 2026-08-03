import type {
  SimHttpApiAuthorizerId,
  SimHttpApiAuthorizerType,
} from "../../api/authorizer/sim-http-api-authorizer.js";
import type { SimHttpApiAuthorizationType } from "../../api/route/sim-http-api-route.js";
import { SimHttpApiRouteScopes } from "../../api/route/sim-http-api-route-scopes.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import type { SimCreateRouteCommandInput } from "./route.command.js";
import { SimHttpApiRouteAuthorizationOptions } from "./sim-http-api-route-authorization-options.js";
import { SimHttpApiRouteAuthorizerInput } from "./sim-http-api-route-authorizer-input.js";

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
 * A `JWT` and a `CUSTOM` route each name an authorizer, and the other two name
 * none. Which options each type has a use for is
 * `SimHttpApiRouteAuthorizationOptions`, and finding the authorizer named is
 * `SimHttpApiRouteAuthorizerInput`, so what is left here is which of the four
 * a route asked for.
 */
export class SimHttpApiRouteAuthorizationInput {
  private readonly input: SimCreateRouteCommandInput;
  private readonly options: SimHttpApiRouteAuthorizationOptions;

  constructor(input: SimCreateRouteCommandInput) {
    this.input = input;
    this.options = new SimHttpApiRouteAuthorizationOptions(input);
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

    if (authorizationType === "CUSTOM") {
      return this.custom(api);
    }

    return this.jwt(api);
  }

  /**
   * A route anyone may call, which is what a route says by leaving
   * `AuthorizationType` out.
   */
  private open(): SimHttpApiRouteAuthorization {
    this.options.refuseOnOpenRoute();

    return {
      authorizationType: "NONE",
      authorizationScopes: new SimHttpApiRouteScopes(),
    };
  }

  /**
   * A route IAM decides, which takes neither an authorizer nor scopes.
   */
  private iam(): SimHttpApiRouteAuthorization {
    this.options.refuseOnIamRoute();

    return {
      authorizationType: "AWS_IAM",
      authorizationScopes: new SimHttpApiRouteScopes(),
    };
  }

  /**
   * A route a Lambda `REQUEST` authorizer decides, which takes no scopes.
   */
  private custom(api: SimHttpApi): SimHttpApiRouteAuthorization {
    this.options.refuseOnCustomRoute();

    return {
      authorizationType: "CUSTOM",
      authorizerId: this.authorizer(api, "REQUEST"),
      authorizationScopes: new SimHttpApiRouteScopes(),
    };
  }

  /**
   * A route a JWT authorizer decides, which is the one kind route scopes
   * apply to.
   */
  private jwt(api: SimHttpApi): SimHttpApiRouteAuthorization {
    return {
      authorizationType: "JWT",
      authorizerId: this.authorizer(api, "JWT"),
      authorizationScopes: new SimHttpApiRouteScopes(
        this.input.AuthorizationScopes ?? [],
      ),
    };
  }

  private authorizer(
    api: SimHttpApi,
    authorizerType: SimHttpApiAuthorizerType,
  ): SimHttpApiAuthorizerId {
    return new SimHttpApiRouteAuthorizerInput({
      authorizationType: this.input.AuthorizationType ?? "",
      authorizerId: this.input.AuthorizerId,
    }).read(api, authorizerType);
  }
}
