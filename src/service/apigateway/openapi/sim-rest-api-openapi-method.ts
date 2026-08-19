import type { SimRestApiIntegrationCommands } from "../command/integration/sim-rest-api-integration-commands.js";
import type { SimRestApiMethodCommands } from "../command/method/sim-rest-api-method-commands.js";
import type { SimRestApiOpenApiCommand } from "./sim-rest-api-openapi-command.js";
import { SimRestApiOpenApiIntegration } from "./sim-rest-api-openapi-integration.js";
import type { SimRestApiOpenApiOperation } from "./sim-rest-api-openapi-operation.js";

/**
 * The authorization type every imported method is declared with.
 *
 * A document naming an authorizer is refused while reading one out of a
 * document is unsimulated, so an imported method is an open one or the import
 * did not happen. `CreateAuthorizer` and `PutMethod` gate a method that was
 * declared through the commands.
 */
const importedAuthorizationType = "NONE";

interface SimRestApiOpenApiMethodsProperties {
  readonly methodCommands: SimRestApiMethodCommands;
  readonly integrationCommands: SimRestApiIntegrationCommands;
  readonly command: SimRestApiOpenApiCommand;
}

/**
 * Declares the method one operation becomes, and what it does with a request.
 *
 * A REST API declares the two separately, so one operation is two commands,
 * both of them the ordinary ones.
 */
export class SimRestApiOpenApiMethods {
  private readonly methodCommands: SimRestApiMethodCommands;
  private readonly integrationCommands: SimRestApiIntegrationCommands;
  private readonly command: SimRestApiOpenApiCommand;

  constructor(properties: SimRestApiOpenApiMethodsProperties) {
    this.methodCommands = properties.methodCommands;
    this.integrationCommands = properties.integrationCommands;
    this.command = properties.command;
  }

  /**
   * Declare one operation on the resource its path reached.
   *
   * The integration is read before the method is declared, so a document
   * carrying one this simulation cannot create leaves no method behind for the
   * next import of the corrected document to collide with.
   */
  declare(
    restApiId: string,
    resourceId: string,
    operation: SimRestApiOpenApiOperation,
  ): void {
    const declared = operation.integration();
    const integration = new SimRestApiOpenApiIntegration(
      declared,
    ).putIntegrationInput();
    const address = { restApiId, resourceId, httpMethod: operation.httpMethod };

    this.command.run(operation.pointer(), () =>
      this.methodCommands.putMethod({
        input: { ...address, authorizationType: importedAuthorizationType },
      }),
    );

    this.command.run(declared.pointer, () =>
      this.integrationCommands.putIntegration({
        input: { ...address, ...integration },
      }),
    );
  }
}
