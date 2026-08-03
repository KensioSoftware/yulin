import type { SimHttpApiAuthorizerCommands } from "../command/authorizer/sim-http-api-authorizer-commands.js";
import type { SimCreateRouteCommandInput } from "../command/route/route.command.js";
import type { SimHttpApiOpenApiCommand } from "./sim-http-api-openapi-command.js";
import type { SimHttpApiOpenApiOperation } from "./sim-http-api-openapi-operation.js";
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

    const shared = schemes.createdId(requirement.schemeName);

    if (shared !== undefined) {
      return this.jwt(shared, requirement.scopes);
    }

    const input = schemes.authorizerInput(apiId, requirement);
    const created = this.command.run(requirement.value.pointer, () =>
      this.authorizerCommands.createAuthorizer({ input }),
    );
    schemes.remember(requirement.schemeName, created.AuthorizerId);

    return this.jwt(created.AuthorizerId, requirement.scopes);
  }

  /**
   * A route the named authorizer decides, asking for the requirement's scopes.
   */
  private jwt(
    authorizerId: string,
    scopes: readonly string[],
  ): SimHttpApiOpenApiRouteAuthorization {
    return {
      AuthorizationType: "JWT",
      AuthorizerId: authorizerId,
      AuthorizationScopes: scopes,
    };
  }
}
