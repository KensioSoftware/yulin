import type { SimHttpApiAuthorizerCommands } from "../command/authorizer/sim-http-api-authorizer-commands.js";
import type { SimHttpApiIntegrationCommands } from "../command/integration/sim-http-api-integration-commands.js";
import type { SimHttpApiRouteCommands } from "../command/route/sim-http-api-route-commands.js";
import { SimHttpApiOpenApiCommand } from "./sim-http-api-openapi-command.js";
import type { SimHttpApiOpenApiDocument } from "./sim-http-api-openapi-document.js";
import { SimHttpApiOpenApiIntegrations } from "./sim-http-api-openapi-integrations.js";
import type { SimHttpApiOpenApiOperation } from "./sim-http-api-openapi-operation.js";
import { SimHttpApiOpenApiAuthorization } from "./sim-http-api-openapi-route-authorization.js";
import { SimHttpApiOpenApiSecuritySchemes } from "./sim-http-api-openapi-security-schemes.js";

interface SimHttpApiOpenApiImportProperties {
  readonly integrationCommands: SimHttpApiIntegrationCommands;
  readonly routeCommands: SimHttpApiRouteCommands;
  readonly authorizerCommands: SimHttpApiAuthorizerCommands;
}

/**
 * Turns a read OpenAPI document into the routes, integrations and authorizers
 * of an API that already exists.
 *
 * Everything is created through the ordinary commands, so an imported API is
 * held to the rules an SDK caller is held to.
 */
export class SimHttpApiOpenApiImport {
  private readonly integrationCommands: SimHttpApiIntegrationCommands;
  private readonly routeCommands: SimHttpApiRouteCommands;
  private readonly authorization: SimHttpApiOpenApiAuthorization;
  private readonly command = new SimHttpApiOpenApiCommand();

  constructor(properties: SimHttpApiOpenApiImportProperties) {
    this.integrationCommands = properties.integrationCommands;
    this.routeCommands = properties.routeCommands;
    this.authorization = new SimHttpApiOpenApiAuthorization({
      authorizerCommands: properties.authorizerCommands,
      command: this.command,
    });
  }

  /**
   * Create everything the document declares on an API.
   */
  into(apiId: string, document: SimHttpApiOpenApiDocument): void {
    const integrations = new SimHttpApiOpenApiIntegrations({
      definitions: document.integrationDefinitions(),
      integrationCommands: this.integrationCommands,
      command: this.command,
    });
    const schemes = new SimHttpApiOpenApiSecuritySchemes({
      schemes: document.securitySchemes(),
    });

    for (const item of document.paths().items()) {
      for (const operation of item.operations()) {
        this.route(apiId, operation, integrations, schemes);
      }
    }
  }

  /**
   * Create the route one operation becomes.
   */
  private route(
    apiId: string,
    operation: SimHttpApiOpenApiOperation,
    integrations: SimHttpApiOpenApiIntegrations,
    schemes: SimHttpApiOpenApiSecuritySchemes,
  ): void {
    const target = `integrations/${integrations.idFor(apiId, operation)}`;
    const authorization = this.authorization.of(apiId, operation, schemes);

    this.command.run(operation.pointer(), () =>
      this.routeCommands.createRoute({
        input: {
          ApiId: apiId,
          RouteKey: operation.routeKey,
          Target: target,
          ...authorization,
        },
      }),
    );
  }
}
