import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import { simSdkCallerOptions } from "../../../sdk/index.js";
import type { SimPutFunctionEventInvokeConfigCommand } from "../command/put-function-event-invoke-config/put-function-event-invoke-config.command.js";
import type { SimGetFunctionEventInvokeConfigCommand } from "../command/get-function-event-invoke-config/get-function-event-invoke-config.command.js";
import type { SimUpdateFunctionEventInvokeConfigCommand } from "../command/update-function-event-invoke-config/update-function-event-invoke-config.command.js";
import type { SimDeleteFunctionEventInvokeConfigCommand } from "../command/delete-function-event-invoke-config/delete-function-event-invoke-config.command.js";
import type { SimListFunctionEventInvokeConfigsCommand } from "../command/list-function-event-invoke-configs/list-function-event-invoke-configs.command.js";
import type { SimLambda } from "../sim-lambda.js";

/**
 * The routes for the five event invoke config Commands.
 *
 * They are built here rather than in the router's own constructor, which holds
 * every other Lambda Command and is at the length this codebase allows.
 */
export function simLambdaEventInvokeConfigRoutes(
  simLambda: SimLambda,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "PutFunctionEventInvokeConfigCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.putFunctionEventInvokeConfig(
          command as SimPutFunctionEventInvokeConfigCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetFunctionEventInvokeConfigCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.getFunctionEventInvokeConfig(
          command as SimGetFunctionEventInvokeConfigCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "UpdateFunctionEventInvokeConfigCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.updateFunctionEventInvokeConfig(
          command as SimUpdateFunctionEventInvokeConfigCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteFunctionEventInvokeConfigCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.deleteFunctionEventInvokeConfig(
          command as SimDeleteFunctionEventInvokeConfigCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListFunctionEventInvokeConfigsCommand",
      async (command, context): Promise<unknown> =>
        await simLambda.listFunctionEventInvokeConfigs(
          command as SimListFunctionEventInvokeConfigsCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
