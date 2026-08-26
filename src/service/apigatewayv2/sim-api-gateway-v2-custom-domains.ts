import type * as simApiGatewayV2Commands from "./command/sim-api-gateway-v2-command.types.js";
import type { SimApiGatewayV2RequestOptions } from "./command/sim-api-gateway-v2-request-options.js";
import type { SimHttpApiDomainName } from "./domain/sim-http-api-domain-name.js";
import type { SimApiGatewayV2Commands } from "./sim-api-gateway-v2-commands.js";

interface SimApiGatewayV2CustomDomainsProperties {
  readonly commands: SimApiGatewayV2Commands;
}

/**
 * The custom domain name and API mapping operations of simulated API Gateway
 * v2.
 *
 * A domain answers on a hostname the project owns, and an API mapping points a
 * base path of that domain at one API and one of its stages. Neither is owned
 * by an API, which is why they are here and not under one.
 *
 * They are a class of their own for the reason the Cognito chain is: one class
 * holding every operation had outgrown the file-length limit, and
 * `SimApiGatewayV2` above this holds the wiring the whole service is built
 * from.
 */
export abstract class SimApiGatewayV2CustomDomains {
  protected readonly commands: SimApiGatewayV2Commands;

  protected constructor(properties: SimApiGatewayV2CustomDomainsProperties) {
    this.commands = properties.commands;
  }

  /**
   * Find a custom domain name by the name it was created with.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * domain state without going through a Command and its authorization.
   */
  findDomainName(domainName: string): SimHttpApiDomainName | undefined {
    return this.commands.domains.find(domainName);
  }

  /**
   * Handle a CreateDomainName Command from the SDK.
   */
  async createDomainName(
    command: simApiGatewayV2Commands.SimCreateDomainNameCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateDomainNameCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.domainNames.createDomainName(command, options);
  }

  /**
   * Handle a GetDomainName Command from the SDK.
   */
  async getDomainName(
    command: simApiGatewayV2Commands.SimGetDomainNameCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetDomainNameCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.domainNames.getDomainName(command, options);
  }

  /**
   * Handle a GetDomainNames Command from the SDK.
   */
  async getDomainNames(
    command: simApiGatewayV2Commands.SimGetDomainNamesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetDomainNamesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.domainNames.getDomainNames(command, options);
  }

  /**
   * Handle a DeleteDomainName Command from the SDK.
   */
  async deleteDomainName(
    command: simApiGatewayV2Commands.SimDeleteDomainNameCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteDomainNameCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.domainNames.deleteDomainName(command, options);
  }

  /**
   * Handle a CreateApiMapping Command from the SDK.
   */
  async createApiMapping(
    command: simApiGatewayV2Commands.SimCreateApiMappingCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateApiMappingCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.apiMappings.createApiMapping(command, options);
  }

  /**
   * Handle a GetApiMapping Command from the SDK.
   */
  async getApiMapping(
    command: simApiGatewayV2Commands.SimGetApiMappingCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetApiMappingCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.apiMappings.getApiMapping(command, options);
  }

  /**
   * Handle a GetApiMappings Command from the SDK.
   */
  async getApiMappings(
    command: simApiGatewayV2Commands.SimGetApiMappingsCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetApiMappingsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.apiMappings.getApiMappings(command, options);
  }

  /**
   * Handle a DeleteApiMapping Command from the SDK.
   */
  async deleteApiMapping(
    command: simApiGatewayV2Commands.SimDeleteApiMappingCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteApiMappingCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.apiMappings.deleteApiMapping(command, options);
  }
}
