import type { SimHttpApiIntegrationCommands } from "../command/integration/sim-http-api-integration-commands.js";
import type { SimHttpApiOpenApiCommand } from "./sim-http-api-openapi-command.js";
import { SimHttpApiOpenApiIntegrationReferences } from "./sim-http-api-openapi-integration-references.js";
import type { SimHttpApiOpenApiOperation } from "./sim-http-api-openapi-operation.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

interface SimHttpApiOpenApiIntegrationsProperties {
  readonly definitions: SimHttpApiOpenApiValue;
  readonly integrationCommands: SimHttpApiIntegrationCommands;
  readonly command: SimHttpApiOpenApiCommand;
}

/**
 * Creates the integration behind each operation of one document being
 * imported.
 *
 * A definition referenced by `$ref` is created once and shared by every
 * operation naming it, so this is per-import rather than per-operation.
 */
export class SimHttpApiOpenApiIntegrations {
  private readonly references: SimHttpApiOpenApiIntegrationReferences;
  private readonly integrationCommands: SimHttpApiIntegrationCommands;
  private readonly command: SimHttpApiOpenApiCommand;

  constructor(properties: SimHttpApiOpenApiIntegrationsProperties) {
    this.references = new SimHttpApiOpenApiIntegrationReferences({
      definitions: properties.definitions,
    });
    this.integrationCommands = properties.integrationCommands;
    this.command = properties.command;
  }

  /**
   * The integration one operation routes to, created unless a definition this
   * document already created is referenced again.
   */
  idFor(apiId: string, operation: SimHttpApiOpenApiOperation): string {
    const declared = operation.integration();
    const source = this.references.resolve(declared);
    const shared = this.references.createdId(source.name);

    if (shared !== undefined) {
      return shared;
    }

    const input = source.integration.createIntegrationInput(apiId);
    const created = this.command.run(declared.pointer, () =>
      this.integrationCommands.createIntegration({ input }),
    );
    this.references.remember(source.name, created.IntegrationId);

    return created.IntegrationId;
  }
}
