import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimAddPermissionCommand } from "../command/add-permission/add-permission.command.js";
import type { SimCreateAliasCommand } from "../command/create-alias/create-alias.command.js";
import type { SimDeleteAliasCommand } from "../command/delete-alias/delete-alias.command.js";
import type { SimGetAliasCommand } from "../command/get-alias/get-alias.command.js";
import type { SimListAliasesCommand } from "../command/list-aliases/list-aliases.command.js";
import type { SimListVersionsByFunctionCommand } from "../command/list-versions-by-function/list-versions-by-function.command.js";
import type { SimPublishVersionCommand } from "../command/publish-version/publish-version.command.js";
import type { SimUpdateAliasCommand } from "../command/update-alias/update-alias.command.js";
import type { SimCreateFunctionCommand } from "../command/create-function/create-function.command.js";
import type { SimListFunctionsCommand } from "../command/list-functions/list-functions.command.js";
import type { SimUpdateFunctionCodeCommand } from "../command/update-function-code/update-function-code.command.js";
import type {
  SimCreateEventSourceMappingCommand,
  SimDeleteEventSourceMappingCommand,
  SimGetEventSourceMappingCommand,
  SimListEventSourceMappingsCommand,
} from "../command/event-source-mapping/event-source-mapping.command.js";
import type { SimCreateFunctionUrlConfigCommand } from "../command/create-function-url-config/create-function-url-config.command.js";
import type { SimDeleteFunctionCommand } from "../command/delete-function/delete-function.command.js";
import type { SimDeleteFunctionUrlConfigCommand } from "../command/delete-function-url-config/delete-function-url-config.command.js";
import type { SimGetFunctionCommand } from "../command/get-function/get-function.command.js";
import type { SimGetFunctionUrlConfigCommand } from "../command/get-function-url-config/get-function-url-config.command.js";
import type { SimGetPolicyCommand } from "../command/get-policy/get-policy.command.js";
import type { SimInvokeCommand } from "../command/invoke/invoke.command.js";
import type { SimListFunctionUrlConfigsCommand } from "../command/list-function-url-configs/list-function-url-configs.command.js";
import type { SimRemovePermissionCommand } from "../command/remove-permission/remove-permission.command.js";
import type { SimUpdateFunctionUrlConfigCommand } from "../command/update-function-url-config/update-function-url-config.command.js";
import type { SimLambda } from "../sim-lambda.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Lambda instance.
 */
export class SimLambdaSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simLambda: SimLambda) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.createFunction(
            command as SimCreateFunctionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.getFunction(
            command as SimGetFunctionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateFunctionCodeCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.updateFunctionCode(
            command as SimUpdateFunctionCodeCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListFunctionsCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.listFunctions(
            command as SimListFunctionsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "InvokeCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.invoke(
            command as SimInvokeCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PublishVersionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.publishVersion(
            command as SimPublishVersionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListVersionsByFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.listVersionsByFunction(
            command as SimListVersionsByFunctionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateAliasCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.createAlias(
            command as SimCreateAliasCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateAliasCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.updateAlias(
            command as SimUpdateAliasCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetAliasCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.getAlias(
            command as SimGetAliasCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListAliasesCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.listAliases(
            command as SimListAliasesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteAliasCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.deleteAlias(
            command as SimDeleteAliasCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateFunctionUrlConfigCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.createFunctionUrlConfig(
            command as SimCreateFunctionUrlConfigCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetFunctionUrlConfigCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.getFunctionUrlConfig(
            command as SimGetFunctionUrlConfigCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateFunctionUrlConfigCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.updateFunctionUrlConfig(
            command as SimUpdateFunctionUrlConfigCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.deleteFunction(
            command as SimDeleteFunctionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteFunctionUrlConfigCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.deleteFunctionUrlConfig(
            command as SimDeleteFunctionUrlConfigCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateEventSourceMappingCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.createEventSourceMapping(
            command as SimCreateEventSourceMappingCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetEventSourceMappingCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.getEventSourceMapping(
            command as SimGetEventSourceMappingCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListEventSourceMappingsCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.listEventSourceMappings(
            command as SimListEventSourceMappingsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteEventSourceMappingCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.deleteEventSourceMapping(
            command as SimDeleteEventSourceMappingCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "AddPermissionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.addPermission(
            command as SimAddPermissionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "RemovePermissionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.removePermission(
            command as SimRemovePermissionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.getPolicy(
            command as SimGetPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListFunctionUrlConfigsCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.listFunctionUrlConfigs(
            command as SimListFunctionUrlConfigsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Lambda can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Lambda supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
