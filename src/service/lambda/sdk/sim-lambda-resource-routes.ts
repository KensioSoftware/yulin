import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import { simSdkCallerOptions } from "../../../sdk/index.js";
import type * as simLambdaCommands from "../command/sim-lambda-command.types.js";
import type { SimLambda } from "../sim-lambda.js";

/**
 * The routes for the tagging, concurrency, account settings, configuration read
 * and mapping update Commands.
 *
 * They are built here rather than in the router's own constructor, which holds
 * every other Lambda Command and is at the length this codebase allows.
 */
export function simLambdaResourceRoutes(
  simLambda: SimLambda,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "GetAccountSettingsCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.getAccountSettings(
          command as simLambdaCommands.SimGetAccountSettingsCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetFunctionConfigurationCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.getFunctionConfiguration(
          command as simLambdaCommands.SimGetFunctionConfigurationCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "TagResourceCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.tagResource(
          command as simLambdaCommands.SimTagResourceCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "UntagResourceCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.untagResource(
          command as simLambdaCommands.SimUntagResourceCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListTagsCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.listTags(
          command as simLambdaCommands.SimListTagsCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutFunctionConcurrencyCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.putFunctionConcurrency(
          command as simLambdaCommands.SimPutFunctionConcurrencyCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetFunctionConcurrencyCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.getFunctionConcurrency(
          command as simLambdaCommands.SimGetFunctionConcurrencyCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteFunctionConcurrencyCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.deleteFunctionConcurrency(
          command as simLambdaCommands.SimDeleteFunctionConcurrencyCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "UpdateEventSourceMappingCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.updateEventSourceMapping(
          command as simLambdaCommands.SimUpdateEventSourceMappingCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
