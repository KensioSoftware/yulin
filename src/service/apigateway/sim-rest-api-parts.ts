import type * as simApiGatewayCommands from "./command/sim-api-gateway-command.types.js";
import type { SimApiGatewayRequestOptions } from "./command/sim-api-gateway-request-options.js";
import type { SimApiGatewayCommands } from "./sim-api-gateway-commands.js";

/**
 * The commands addressing what a REST API holds: its path tree, its
 * authorizers, and the methods and integrations declared on its resources.
 *
 * `SimApiGateway` extends this, so a caller reaches every operation on the one
 * service object the way the real API presents them. They are split up because
 * the API itself, the parts declared on it and publishing it are separate
 * concerns, and each is long enough to read on its own.
 */
export abstract class SimRestApiParts {
  protected readonly commands: SimApiGatewayCommands;

  protected constructor(commands: SimApiGatewayCommands) {
    this.commands = commands;
  }

  /**
   * Handle a CreateResource Command from the SDK.
   */
  async createResource(
    command: simApiGatewayCommands.SimCreateResourceCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimCreateResourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.resources.createResource(command, options);
  }

  /**
   * Handle a GetResource Command from the SDK.
   */
  async getResource(
    command: simApiGatewayCommands.SimGetResourceCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetResourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.resources.getResource(command, options);
  }

  /**
   * Handle a GetResources Command from the SDK.
   */
  async getResources(
    command: simApiGatewayCommands.SimGetResourcesCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetResourcesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.resources.getResources(command, options);
  }

  /**
   * Handle a DeleteResource Command from the SDK.
   */
  async deleteResource(
    command: simApiGatewayCommands.SimDeleteResourceCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimDeleteResourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.resources.deleteResource(command, options);
  }

  /**
   * Handle a CreateAuthorizer Command from the SDK.
   */
  async createAuthorizer(
    command: simApiGatewayCommands.SimCreateAuthorizerCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimCreateAuthorizerCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.authorizers.createAuthorizer(command, options);
  }

  /**
   * Handle a GetAuthorizer Command from the SDK.
   */
  async getAuthorizer(
    command: simApiGatewayCommands.SimGetAuthorizerCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetAuthorizerCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.authorizers.getAuthorizer(command, options);
  }

  /**
   * Handle a GetAuthorizers Command from the SDK.
   */
  async getAuthorizers(
    command: simApiGatewayCommands.SimGetAuthorizersCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetAuthorizersCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.authorizers.getAuthorizers(command, options);
  }

  /**
   * Handle a DeleteAuthorizer Command from the SDK.
   */
  async deleteAuthorizer(
    command: simApiGatewayCommands.SimDeleteAuthorizerCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimDeleteAuthorizerCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.authorizers.deleteAuthorizer(command, options);
  }

  /**
   * Handle a PutMethod Command from the SDK.
   */
  async putMethod(
    command: simApiGatewayCommands.SimPutMethodCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimPutMethodCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.methods.putMethod(command, options);
  }

  /**
   * Handle a GetMethod Command from the SDK.
   */
  async getMethod(
    command: simApiGatewayCommands.SimGetMethodCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetMethodCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.methods.getMethod(command, options);
  }

  /**
   * Handle a DeleteMethod Command from the SDK.
   */
  async deleteMethod(
    command: simApiGatewayCommands.SimDeleteMethodCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimDeleteMethodCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.methods.deleteMethod(command, options);
  }

  /**
   * Handle a PutIntegration Command from the SDK.
   */
  async putIntegration(
    command: simApiGatewayCommands.SimPutIntegrationCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimPutIntegrationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.integrations.putIntegration(command, options);
  }

  /**
   * Handle a GetIntegration Command from the SDK.
   */
  async getIntegration(
    command: simApiGatewayCommands.SimGetIntegrationCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetIntegrationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.integrations.getIntegration(command, options);
  }
}
