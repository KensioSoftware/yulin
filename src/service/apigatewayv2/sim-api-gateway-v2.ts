import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { SimApiGatewayV2CfnResourceFactory } from "./cfn/sim-cfn-api-gateway-v2-resource-factory.js";
import type { SimHttpApi } from "./api/sim-http-api.js";
import type * as simApiGatewayV2Commands from "./command/sim-api-gateway-v2-command.types.js";
import type { SimApiGatewayV2RequestOptions } from "./command/sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2SdkCommandRouter } from "./sdk/sim-api-gateway-v2-sdk-command-router.js";
import {
  SimApiGatewayV2Commands,
  type SimApiGatewayV2Properties,
} from "./sim-api-gateway-v2-commands.js";

/**
 * Simulated API Gateway v2. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * Only HTTP APIs are simulated, which is the half of the v2 API that is not
 * WebSocket. APIs are scoped to an account and region, as they are on real
 * AWS: the endpoint API Gateway generates names the region, and the API id is
 * what tells two APIs apart rather than their names.
 *
 * An API owns its own routes, integrations and stages, because every one of
 * them is addressed by ApiId on real AWS and none of them outlives the API.
 */
export class SimApiGatewayV2 {
  private readonly commands: SimApiGatewayV2Commands;
  private readonly sdkRouter = new SimApiGatewayV2SdkCommandRouter(this);
  private readonly cfnFactory = new SimApiGatewayV2CfnResourceFactory({
    apiGatewayV2: this,
  });

  constructor(properties: SimApiGatewayV2Properties = {}) {
    this.commands = new SimApiGatewayV2Commands(properties);
  }

  /**
   * Find an API by id.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting API
   * state without going through a Command and its authorization.
   */
  findApi(apiId: string): SimHttpApi | undefined {
    return this.commands.apis.find(apiId);
  }

  /**
   * Handle a CreateApi Command from the SDK.
   */
  async createApi(
    command: simApiGatewayV2Commands.SimCreateApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.createApi(command, options);
  }

  /**
   * Handle an ImportApi Command from the SDK.
   *
   * The API, its routes, its integrations and its JWT authorizers all come
   * from one OpenAPI 3.0 document. No stage is created, so an imported API
   * answers 404 until a stage is created separately, which is what an import
   * does on AWS.
   */
  async importApi(
    command: simApiGatewayV2Commands.SimImportApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimImportApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.imports.importApi(command, options);
  }

  /**
   * Handle a GetApi Command from the SDK.
   */
  async getApi(
    command: simApiGatewayV2Commands.SimGetApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.getApi(command, options);
  }

  /**
   * Handle a GetApis Command from the SDK.
   */
  async getApis(
    command: simApiGatewayV2Commands.SimGetApisCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetApisCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.getApis(command, options);
  }

  /**
   * Handle a DeleteApi Command from the SDK.
   */
  async deleteApi(
    command: simApiGatewayV2Commands.SimDeleteApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.deleteApi(command, options);
  }

  /**
   * Handle a CreateAuthorizer Command from the SDK.
   */
  async createAuthorizer(
    command: simApiGatewayV2Commands.SimCreateAuthorizerCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateAuthorizerCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.authorizers.createAuthorizer(command, options);
  }

  /**
   * Handle a GetAuthorizers Command from the SDK.
   */
  async getAuthorizers(
    command: simApiGatewayV2Commands.SimGetAuthorizersCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetAuthorizersCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.authorizers.getAuthorizers(command, options);
  }

  /**
   * Handle a DeleteAuthorizer Command from the SDK.
   */
  async deleteAuthorizer(
    command: simApiGatewayV2Commands.SimDeleteAuthorizerCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteAuthorizerCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.authorizers.deleteAuthorizer(command, options);
  }

  /**
   * Handle a CreateIntegration Command from the SDK.
   */
  async createIntegration(
    command: simApiGatewayV2Commands.SimCreateIntegrationCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateIntegrationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.integrations.createIntegration(command, options);
  }

  /**
   * Handle a GetIntegrations Command from the SDK.
   */
  async getIntegrations(
    command: simApiGatewayV2Commands.SimGetIntegrationsCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetIntegrationsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.integrations.getIntegrations(command, options);
  }

  /**
   * Handle a DeleteIntegration Command from the SDK.
   */
  async deleteIntegration(
    command: simApiGatewayV2Commands.SimDeleteIntegrationCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteIntegrationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.integrations.deleteIntegration(command, options);
  }

  /**
   * Handle a CreateRoute Command from the SDK.
   */
  async createRoute(
    command: simApiGatewayV2Commands.SimCreateRouteCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateRouteCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.routes.createRoute(command, options);
  }

  /**
   * Handle a GetRoutes Command from the SDK.
   */
  async getRoutes(
    command: simApiGatewayV2Commands.SimGetRoutesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetRoutesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.routes.getRoutes(command, options);
  }

  /**
   * Handle a DeleteRoute Command from the SDK.
   */
  async deleteRoute(
    command: simApiGatewayV2Commands.SimDeleteRouteCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteRouteCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.routes.deleteRoute(command, options);
  }

  /**
   * Handle a CreateStage Command from the SDK.
   */
  async createStage(
    command: simApiGatewayV2Commands.SimCreateStageCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateStageCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.stages.createStage(command, options);
  }

  /**
   * Handle a GetStages Command from the SDK.
   */
  async getStages(
    command: simApiGatewayV2Commands.SimGetStagesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetStagesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.stages.getStages(command, options);
  }

  /**
   * Handle a DeleteStage Command from the SDK.
   */
  async deleteStage(
    command: simApiGatewayV2Commands.SimDeleteStageCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteStageCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.stages.deleteStage(command, options);
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimApiGatewayV2CfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
