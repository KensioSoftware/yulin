import type { SimHttpApiAuthorizerView } from "../api/authorizer/sim-http-api-authorizer.js";
import type { SimHttpApiAuthorizerCommands } from "../command/authorizer/sim-http-api-authorizer-commands.js";
import type { SimCreateRouteCommandInput } from "../command/route/route.command.js";
import type { SimHttpApiOpenApiCommand } from "./sim-http-api-openapi-command.js";
import type {
  SimHttpApiOpenApiOperation,
  SimHttpApiOpenApiSecurityRequirement,
} from "./sim-http-api-openapi-operation.js";
import type { SimHttpApiOpenApiSecuritySchemes } from "./sim-http-api-openapi-security-schemes.js";

/**
 * The authorization a route created from a document asks for.
 */
export type SimHttpApiOpenApiRouteAuthorization = Pick<
  SimCreateRouteCommandInput,
  "AuthorizationType" | "AuthorizerId" | "AuthorizationScopes"
>;

interface SimHttpApiOpenApiAuthorizationProperties {
  readonly authorizerCommands: SimHttpApiAuthorizerCommands;
  readonly command: SimHttpApiOpenApiCommand;
}

/**
 * Turns an operation's security requirement into the authorization its route
 * is created with, creating the authorizer the requirement names.
 *
 * An operation with no requirement is open, which is what an imported route
 * with no authorizer is on AWS.
 */
export class SimHttpApiOpenApiAuthorization {
  private readonly authorizerCommands: SimHttpApiAuthorizerCommands;
  private readonly command: SimHttpApiOpenApiCommand;

  constructor(properties: SimHttpApiOpenApiAuthorizationProperties) {
    this.authorizerCommands = properties.authorizerCommands;
    this.command = properties.command;
  }

  /**
   * How the route one operation becomes says who may call it.
   */
  of(
    apiId: string,
    operation: SimHttpApiOpenApiOperation,
    schemes: SimHttpApiOpenApiSecuritySchemes,
  ): SimHttpApiOpenApiRouteAuthorization {
    const requirement = operation.security();

    if (requirement === undefined) {
      return { AuthorizationType: "NONE" };
    }

    const shared = schemes.createdAuthorizer(requirement.schemeName);

    if (shared !== undefined) {
      return this.authorization(shared, requirement.scopes);
    }

    const created = this.create(apiId, requirement, schemes);

    return this.authorization(created, requirement.scopes);
  }

  /**
   * Create the authorizer a requirement's scheme declares, remembering it for
   * the next operation naming the same scheme.
   */
  private create(
    apiId: string,
    requirement: SimHttpApiOpenApiSecurityRequirement,
    schemes: SimHttpApiOpenApiSecuritySchemes,
  ): SimHttpApiAuthorizerView {
    const input = schemes.authorizerInput(apiId, requirement);
    const created = this.command.run(requirement.value.pointer, () =>
      this.authorizerCommands.createAuthorizer({ input }),
    );
    schemes.remember(requirement.schemeName, created);

    return created;
  }

  /**
   * A route the named authorizer decides, of the type that authorizer is.
   *
   * A Lambda `REQUEST` authorizer makes a `CUSTOM` route, and the requirement's
   * scopes go with it rather than being dropped: AWS applies route scopes to a
   * `JWT` route only, so CreateRoute refuses them here.
   */
  private authorization(
    authorizer: SimHttpApiAuthorizerView,
    scopes: readonly string[],
  ): SimHttpApiOpenApiRouteAuthorization {
    if (authorizer.AuthorizerType === "REQUEST") {
      return {
        AuthorizationType: "CUSTOM",
        AuthorizerId: authorizer.AuthorizerId,
        AuthorizationScopes: scopes,
      };
    }

    return {
      AuthorizationType: "JWT",
      AuthorizerId: authorizer.AuthorizerId,
      AuthorizationScopes: scopes,
    };
  }
}
