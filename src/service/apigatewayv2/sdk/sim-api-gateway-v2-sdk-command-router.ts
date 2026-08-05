import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateApiCommand,
  SimDeleteApiCommand,
  SimGetApiCommand,
  SimGetApisCommand,
  SimImportApiCommand,
} from "../command/api/api.command.js";
import type {
  SimCreateAuthorizerCommand,
  SimDeleteAuthorizerCommand,
  SimGetAuthorizersCommand,
} from "../command/authorizer/authorizer.command.js";
import type {
  SimCreateIntegrationCommand,
  SimDeleteIntegrationCommand,
  SimGetIntegrationsCommand,
} from "../command/integration/integration.command.js";
import type {
  SimCreateRouteCommand,
  SimDeleteRouteCommand,
  SimGetRoutesCommand,
} from "../command/route/route.command.js";
import type {
  SimCreateStageCommand,
  SimDeleteStageCommand,
  SimGetStagesCommand,
} from "../command/stage/stage.command.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated API Gateway v2.
 */
export class SimApiGatewayV2SdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simApiGatewayV2: SimApiGatewayV2) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.createApi(
            command as SimCreateApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ImportApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.importApi(
            command as SimImportApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.getApi(
            command as SimGetApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetApisCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.getApis(
            command as SimGetApisCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.deleteApi(
            command as SimDeleteApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateAuthorizerCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.createAuthorizer(
            command as SimCreateAuthorizerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetAuthorizersCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.getAuthorizers(
            command as SimGetAuthorizersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteAuthorizerCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.deleteAuthorizer(
            command as SimDeleteAuthorizerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateIntegrationCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.createIntegration(
            command as SimCreateIntegrationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetIntegrationsCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.getIntegrations(
            command as SimGetIntegrationsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteIntegrationCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.deleteIntegration(
            command as SimDeleteIntegrationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateRouteCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.createRoute(
            command as SimCreateRouteCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetRoutesCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.getRoutes(
            command as SimGetRoutesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRouteCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.deleteRoute(
            command as SimDeleteRouteCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateStageCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.createStage(
            command as SimCreateStageCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetStagesCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.getStages(
            command as SimGetStagesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteStageCommand",
        async (command, context): Promise<unknown> =>
          await simApiGatewayV2.deleteStage(
            command as SimDeleteStageCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated API Gateway v2 can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated API Gateway v2
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
