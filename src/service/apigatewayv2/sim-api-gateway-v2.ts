import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  type SimHttpApiJwtIssuerKeys,
  SimHttpApiNoJwtIssuerKeys,
} from "./api/authorizer/sim-http-api-jwt-issuer-keys.js";
import { SimHttpApiStore } from "./api/sim-http-api-store.js";
import { SimApiGatewayV2CfnResourceFactory } from "./cfn/sim-cfn-api-gateway-v2-resource-factory.js";
import type { SimHttpApi } from "./api/sim-http-api.js";
import { SimHttpApiCommands } from "./command/api/sim-http-api-commands.js";
import { SimHttpApiImportCommands } from "./command/api/sim-http-api-import-commands.js";
import { SimApiGatewayV2Authorizer } from "./command/authorize/sim-api-gateway-v2-authorizer.js";
import { SimHttpApiAuthorizerCommands } from "./command/authorizer/sim-http-api-authorizer-commands.js";
import { SimHttpApiIntegrationCommands } from "./command/integration/sim-http-api-integration-commands.js";
import { SimHttpApiRouteCommands } from "./command/route/sim-http-api-route-commands.js";
import type * as simApiGatewayV2Commands from "./command/sim-api-gateway-v2-command.types.js";
import type { SimApiGatewayV2RequestOptions } from "./command/sim-api-gateway-v2-request-options.js";
import { SimHttpApiAccess } from "./command/sim-http-api-access.js";
import { SimHttpApiStageCommands } from "./command/stage/sim-http-api-stage-commands.js";
import { SimHttpApiRegistry } from "./registry/sim-http-api-registry.js";
import { SimApiGatewayV2SdkCommandRouter } from "./sdk/sim-api-gateway-v2-sdk-command-router.js";

interface SimApiGatewayV2Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly registry?: SimHttpApiRegistry;
  /**
   * The issuers this API Gateway's JWT authorizers can verify against. A
   * standalone simulated API Gateway has none, so a JWT route refuses every
   * request rather than admitting one it could not check.
   */
  readonly jwtIssuerKeys?: SimHttpApiJwtIssuerKeys;
}

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
  private readonly apis = new SimHttpApiStore();
  private readonly apiCommands: SimHttpApiCommands;
  private readonly importCommands: SimHttpApiImportCommands;
  private readonly authorizerCommands: SimHttpApiAuthorizerCommands;
  private readonly integrationCommands: SimHttpApiIntegrationCommands;
  private readonly routeCommands: SimHttpApiRouteCommands;
  private readonly stageCommands: SimHttpApiStageCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimApiGatewayV2SdkCommandRouter(this);
  private readonly cfnFactory = new SimApiGatewayV2CfnResourceFactory({
    apiGatewayV2: this,
  });

  constructor(properties: SimApiGatewayV2Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      registry = new SimHttpApiRegistry(),
      jwtIssuerKeys = new SimHttpApiNoJwtIssuerKeys(),
    } = properties;

    const access = new SimHttpApiAccess({
      apis: this.apis,
      authorizer: new SimApiGatewayV2Authorizer({ iam, accountRegionScope }),
    });

    this.background = background;
    this.apiCommands = new SimHttpApiCommands({
      apis: this.apis,
      registry,
      access,
      accountRegionScope,
      clock: background,
      jwtIssuerKeys,
    });
    this.authorizerCommands = new SimHttpApiAuthorizerCommands({ access });
    this.integrationCommands = new SimHttpApiIntegrationCommands({ access });
    this.routeCommands = new SimHttpApiRouteCommands({ access });
    this.stageCommands = new SimHttpApiStageCommands({
      access,
      clock: background,
    });
    this.importCommands = new SimHttpApiImportCommands({
      apis: this.apis,
      registry,
      apiCommands: this.apiCommands,
      authorizerCommands: this.authorizerCommands,
      integrationCommands: this.integrationCommands,
      routeCommands: this.routeCommands,
    });
  }

  /**
   * Find an API by id.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting API
   * state without going through a Command and its authorization.
   */
  findApi(apiId: string): SimHttpApi | undefined {
    return this.apis.find(apiId);
  }

  /**
   * Handle a CreateApi Command from the SDK.
   */
  async createApi(
    command: simApiGatewayV2Commands.SimCreateApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateApiCommandOutput> {
    await this.background.sequence();
    return this.apiCommands.createApi(command, options);
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
    await this.background.sequence();
    return this.importCommands.importApi(command, options);
  }

  /**
   * Handle a GetApi Command from the SDK.
   */
  async getApi(
    command: simApiGatewayV2Commands.SimGetApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetApiCommandOutput> {
    await this.background.sequence();
    return this.apiCommands.getApi(command, options);
  }

  /**
   * Handle a GetApis Command from the SDK.
   */
  async getApis(
    command: simApiGatewayV2Commands.SimGetApisCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetApisCommandOutput> {
    await this.background.sequence();
    return this.apiCommands.getApis(command, options);
  }

  /**
   * Handle a DeleteApi Command from the SDK.
   */
  async deleteApi(
    command: simApiGatewayV2Commands.SimDeleteApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteApiCommandOutput> {
    await this.background.sequence();
    return this.apiCommands.deleteApi(command, options);
  }

  /**
   * Handle a CreateAuthorizer Command from the SDK.
   */
  async createAuthorizer(
    command: simApiGatewayV2Commands.SimCreateAuthorizerCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateAuthorizerCommandOutput> {
    await this.background.sequence();
    return this.authorizerCommands.createAuthorizer(command, options);
  }

  /**
   * Handle a GetAuthorizers Command from the SDK.
   */
  async getAuthorizers(
    command: simApiGatewayV2Commands.SimGetAuthorizersCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetAuthorizersCommandOutput> {
    await this.background.sequence();
    return this.authorizerCommands.getAuthorizers(command, options);
  }

  /**
   * Handle a DeleteAuthorizer Command from the SDK.
   */
  async deleteAuthorizer(
    command: simApiGatewayV2Commands.SimDeleteAuthorizerCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimDeleteAuthorizerCommandOutput> {
    await this.background.sequence();
    return this.authorizerCommands.deleteAuthorizer(command, options);
  }

  /**
   * Handle a CreateIntegration Command from the SDK.
   */
  async createIntegration(
    command: simApiGatewayV2Commands.SimCreateIntegrationCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateIntegrationCommandOutput> {
    await this.background.sequence();
    return this.integrationCommands.createIntegration(command, options);
  }

  /**
   * Handle a GetIntegrations Command from the SDK.
   */
  async getIntegrations(
    command: simApiGatewayV2Commands.SimGetIntegrationsCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetIntegrationsCommandOutput> {
    await this.background.sequence();
    return this.integrationCommands.getIntegrations(command, options);
  }

  /**
   * Handle a CreateRoute Command from the SDK.
   */
  async createRoute(
    command: simApiGatewayV2Commands.SimCreateRouteCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateRouteCommandOutput> {
    await this.background.sequence();
    return this.routeCommands.createRoute(command, options);
  }

  /**
   * Handle a GetRoutes Command from the SDK.
   */
  async getRoutes(
    command: simApiGatewayV2Commands.SimGetRoutesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetRoutesCommandOutput> {
    await this.background.sequence();
    return this.routeCommands.getRoutes(command, options);
  }

  /**
   * Handle a CreateStage Command from the SDK.
   */
  async createStage(
    command: simApiGatewayV2Commands.SimCreateStageCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimCreateStageCommandOutput> {
    await this.background.sequence();
    return this.stageCommands.createStage(command, options);
  }

  /**
   * Handle a GetStages Command from the SDK.
   */
  async getStages(
    command: simApiGatewayV2Commands.SimGetStagesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): Promise<simApiGatewayV2Commands.SimGetStagesCommandOutput> {
    await this.background.sequence();
    return this.stageCommands.getStages(command, options);
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
