import type { SimRestApi } from "../api/sim-rest-api.js";
import type { SimRestApiIntegrationCommands } from "../command/integration/sim-rest-api-integration-commands.js";
import type { SimRestApiMethodCommands } from "../command/method/sim-rest-api-method-commands.js";
import type { SimRestApiResourceCommands } from "../command/resource/sim-rest-api-resource-commands.js";
import { SimRestApiOpenApiCommand } from "./sim-rest-api-openapi-command.js";
import type { SimRestApiOpenApiDocument } from "./sim-rest-api-openapi-document.js";
import { SimRestApiOpenApiMethods } from "./sim-rest-api-openapi-method.js";
import { SimRestApiOpenApiPathTree } from "./sim-rest-api-openapi-path-tree.js";

interface SimRestApiOpenApiImportProperties {
  readonly resourceCommands: SimRestApiResourceCommands;
  readonly methodCommands: SimRestApiMethodCommands;
  readonly integrationCommands: SimRestApiIntegrationCommands;
}

/**
 * Turns a read OpenAPI document into the resources, methods and integrations
 * of an API that already exists.
 *
 * Everything is created through the ordinary commands, so an imported API is
 * held to the rules an SDK caller is held to.
 */
export class SimRestApiOpenApiImport {
  private readonly resourceCommands: SimRestApiResourceCommands;
  private readonly command = new SimRestApiOpenApiCommand();
  private readonly methods: SimRestApiOpenApiMethods;

  constructor(properties: SimRestApiOpenApiImportProperties) {
    this.resourceCommands = properties.resourceCommands;
    this.methods = new SimRestApiOpenApiMethods({
      methodCommands: properties.methodCommands,
      integrationCommands: properties.integrationCommands,
      command: this.command,
    });
  }

  /**
   * Create everything the document declares on an API.
   */
  into(restApi: SimRestApi, document: SimRestApiOpenApiDocument): void {
    const tree = new SimRestApiOpenApiPathTree({
      restApiId: restApi.apiId,
      rootResourceId: restApi.rootResource.resourceId,
      resourceCommands: this.resourceCommands,
      command: this.command,
    });

    for (const item of document.paths().items()) {
      const resourceId = tree.resourceIdFor(item);

      for (const operation of item.operations()) {
        this.methods.declare(restApi.apiId, resourceId, operation);
      }
    }
  }
}
