import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimRestApi } from "./api/sim-rest-api.js";
import type * as simApiGatewayCommands from "./command/sim-api-gateway-command.types.js";
import type { SimApiGatewayRequestOptions } from "./command/sim-api-gateway-request-options.js";
import { SimApiGatewaySdkCommandRouter } from "./sdk/sim-api-gateway-sdk-command-router.js";
import {
  SimApiGatewayCommands,
  type SimApiGatewayProperties,
} from "./sim-api-gateway-commands.js";

/**
 * Simulated API Gateway. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * This is the v1 API, which is REST APIs. HTTP APIs are the v2 service and are
 * simulated separately as `simAws.apiGatewayV2()`, on their own SDK client.
 *
 * REST APIs are scoped to an Account and Region, as they are on real AWS. The
 * endpoint API Gateway generates names the Region, and the API id is what
 * tells two APIs apart rather than their names.
 *
 * An API owns its resources, deployments and stages, and a resource owns its
 * methods, because every one of them is addressed by `restApiId` on real AWS
 * and none of them outlives the API.
 */
export class SimApiGateway {
  private readonly commands: SimApiGatewayCommands;
  private readonly sdkRouter = new SimApiGatewaySdkCommandRouter(this);

  constructor(properties: SimApiGatewayProperties = {}) {
    this.commands = new SimApiGatewayCommands(properties);
  }

  /**
   * Find a REST API by id.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting API
   * state without going through a Command and its authorization.
   */
  findRestApi(restApiId: string): SimRestApi | undefined {
    return this.commands.apis.find(restApiId);
  }

  /**
   * Handle a CreateRestApi Command from the SDK.
   */
  async createRestApi(
    command: simApiGatewayCommands.SimCreateRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimCreateRestApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.createRestApi(command, options);
  }

  /**
   * Handle a GetRestApi Command from the SDK.
   */
  async getRestApi(
    command: simApiGatewayCommands.SimGetRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetRestApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.getRestApi(command, options);
  }

  /**
   * Handle a GetRestApis Command from the SDK.
   */
  async getRestApis(
    command: simApiGatewayCommands.SimGetRestApisCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetRestApisCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.getRestApis(command, options);
  }

  /**
   * Handle an UpdateRestApi Command from the SDK.
   */
  async updateRestApi(
    command: simApiGatewayCommands.SimUpdateRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimUpdateRestApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.updateRestApi(command, options);
  }

  /**
   * Handle a DeleteRestApi Command from the SDK.
   */
  async deleteRestApi(
    command: simApiGatewayCommands.SimDeleteRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimDeleteRestApiCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.api.deleteRestApi(command, options);
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

  /**
   * Handle a CreateDeployment Command from the SDK.
   */
  async createDeployment(
    command: simApiGatewayCommands.SimCreateDeploymentCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimCreateDeploymentCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deployments.createDeployment(command, options);
  }

  /**
   * Handle a CreateStage Command from the SDK.
   */
  async createStage(
    command: simApiGatewayCommands.SimCreateStageCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimCreateStageCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.stages.createStage(command, options);
  }

  /**
   * Handle a GetStage Command from the SDK.
   */
  async getStage(
    command: simApiGatewayCommands.SimGetStageCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetStageCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.stages.getStage(command, options);
  }

  /**
   * Handle a GetStages Command from the SDK.
   */
  async getStages(
    command: simApiGatewayCommands.SimGetStagesCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimGetStagesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.stages.getStages(command, options);
  }

  /**
   * Handle a DeleteStage Command from the SDK.
   */
  async deleteStage(
    command: simApiGatewayCommands.SimDeleteStageCommand,
    options?: SimApiGatewayRequestOptions,
  ): Promise<simApiGatewayCommands.SimDeleteStageCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.stages.deleteStage(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
