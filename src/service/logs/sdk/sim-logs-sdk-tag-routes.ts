import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
} from "../../../sdk/index.js";
import type {
  SimLogsListTagsForResourceCommand,
  SimLogsTagResourceCommand,
  SimLogsUntagResourceCommand,
} from "../command/group/tag.command.js";
import type { SimLogs } from "../sim-logs.js";

/**
 * The SDK Command routes for tagging a log group.
 */
export function simLogsSdkTagRoutes(
  simLogs: SimLogs,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "TagResourceCommand",
      async (command, context): Promise<unknown> =>
        await simLogs.tagResource(
          command as SimLogsTagResourceCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "UntagResourceCommand",
      async (command, context): Promise<unknown> =>
        await simLogs.untagResource(
          command as SimLogsUntagResourceCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListTagsForResourceCommand",
      async (command, context): Promise<unknown> =>
        await simLogs.listTagsForResource(
          command as SimLogsListTagsForResourceCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
