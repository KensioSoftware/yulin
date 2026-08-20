import type { SimRestApiIntegrationCommands } from "../command/integration/sim-rest-api-integration-commands.js";
import type { SimRestApiMethodCommands } from "../command/method/sim-rest-api-method-commands.js";
import type { SimRestApiOpenApiCommand } from "./sim-rest-api-openapi-command.js";
import { SimRestApiOpenApiIntegration } from "./sim-rest-api-openapi-integration.js";
import type { SimRestApiOpenApiAuthorization } from "./sim-rest-api-openapi-method-authorization.js";
import type { SimRestApiOpenApiOperation } from "./sim-rest-api-openapi-operation.js";
import type { SimRestApiOpenApiSecuritySchemes } from "./sim-rest-api-openapi-security-schemes.js";

interface SimRestApiOpenApiMethodsProperties {
  readonly methodCommands: SimRestApiMethodCommands;
  readonly integrationCommands: SimRestApiIntegrationCommands;
  readonly authorization: SimRestApiOpenApiAuthorization;
  readonly command: SimRestApiOpenApiCommand;
}

/**
 * Declares the method one operation becomes, who may call it, and what it does
 * with a request.
 *
 * A REST API declares the method and its integration separately, so one
 * operation is two commands, both of them the ordinary ones.
 */
export class SimRestApiOpenApiMethods {
  private readonly methodCommands: SimRestApiMethodCommands;
  private readonly integrationCommands: SimRestApiIntegrationCommands;
  private readonly authorization: SimRestApiOpenApiAuthorization;
  private readonly command: SimRestApiOpenApiCommand;

  constructor(properties: SimRestApiOpenApiMethodsProperties) {
    this.methodCommands = properties.methodCommands;
    this.integrationCommands = properties.integrationCommands;
    this.authorization = properties.authorization;
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
    schemes: SimRestApiOpenApiSecuritySchemes,
  ): void {
    const declared = operation.integration();
    const integration = new SimRestApiOpenApiIntegration(
      declared,
    ).putIntegrationInput();
    const authorization = this.authorization.of(restApiId, operation, schemes);
    const address = { restApiId, resourceId, httpMethod: operation.httpMethod };

    this.command.run(operation.pointer(), () =>
      this.methodCommands.putMethod({
        input: { ...address, ...authorization },
      }),
    );

    this.command.run(declared.pointer, () =>
      this.integrationCommands.putIntegration({
        input: { ...address, ...integration },
      }),
    );
  }
}
