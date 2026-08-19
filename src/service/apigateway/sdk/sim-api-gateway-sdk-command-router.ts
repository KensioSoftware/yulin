import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateRestApiCommand,
  SimGetRestApiCommand,
  SimGetRestApisCommand,
  SimUpdateRestApiCommand,
  SimDeleteRestApiCommand,
  SimCreateResourceCommand,
  SimGetResourceCommand,
  SimGetResourcesCommand,
  SimDeleteResourceCommand,
  SimCreateAuthorizerCommand,
  SimGetAuthorizerCommand,
  SimGetAuthorizersCommand,
  SimDeleteAuthorizerCommand,
  SimPutMethodCommand,
  SimGetMethodCommand,
  SimDeleteMethodCommand,
  SimPutIntegrationCommand,
  SimGetIntegrationCommand,
  SimCreateDeploymentCommand,
  SimCreateStageCommand,
  SimGetStageCommand,
  SimGetStagesCommand,
  SimDeleteStageCommand,
} from "../command/sim-api-gateway-command.types.js";
import type { SimApiGateway } from "../sim-api-gateway.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated API Gateway.
 *
 * These are the `@aws-sdk/client-api-gateway` Command names, which are the v1
 * REST API ones. The v2 client has its own router, and no Command name is
 * shared between the two.
 */
export class SimApiGatewaySdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simApiGateway: SimApiGateway) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateRestApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.createRestApi(
            command as SimCreateRestApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetRestApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getRestApi(
            command as SimGetRestApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetRestApisCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getRestApis(
            command as SimGetRestApisCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateRestApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.updateRestApi(
            command as SimUpdateRestApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRestApiCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.deleteRestApi(
            command as SimDeleteRestApiCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateResourceCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.createResource(
            command as SimCreateResourceCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetResourceCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getResource(
            command as SimGetResourceCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetResourcesCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getResources(
            command as SimGetResourcesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteResourceCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.deleteResource(
            command as SimDeleteResourceCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateAuthorizerCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.createAuthorizer(
            command as SimCreateAuthorizerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetAuthorizerCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getAuthorizer(
            command as SimGetAuthorizerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetAuthorizersCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getAuthorizers(
            command as SimGetAuthorizersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteAuthorizerCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.deleteAuthorizer(
            command as SimDeleteAuthorizerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutMethodCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.putMethod(
            command as SimPutMethodCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetMethodCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getMethod(
            command as SimGetMethodCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteMethodCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.deleteMethod(
            command as SimDeleteMethodCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutIntegrationCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.putIntegration(
            command as SimPutIntegrationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetIntegrationCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getIntegration(
            command as SimGetIntegrationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateDeploymentCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.createDeployment(
            command as SimCreateDeploymentCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateStageCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.createStage(
            command as SimCreateStageCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetStageCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getStage(
            command as SimGetStageCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetStagesCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.getStages(
            command as SimGetStagesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteStageCommand",
        async (command, context): Promise<unknown> =>
          await simApiGateway.deleteStage(
            command as SimDeleteStageCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated API Gateway can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated API Gateway supports
   * it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
