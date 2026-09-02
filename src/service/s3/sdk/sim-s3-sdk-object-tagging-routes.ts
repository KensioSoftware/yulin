import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import { simSdkCallerOptions } from "../../../sdk/index.js";
import type * as simS3Commands from "../command/sim-s3-command.types.js";
import type { SimS3 } from "../sim-s3.js";

/**
 * The SDK Commands that hold tags against an Object.
 *
 * They route together because each is granted by a permission of its own, and
 * none of them is reachable through `PutObject` or `GetObject`.
 */
export function simS3SdkObjectTaggingRoutes(
  simS3: SimS3,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "PutObjectTaggingCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putObjectTagging(
          command as simS3Commands.SimPutObjectTaggingCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetObjectTaggingCommand",
      async (command, context): Promise<unknown> =>
        await simS3.getObjectTagging(
          command as simS3Commands.SimGetObjectTaggingCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteObjectTaggingCommand",
      async (command, context): Promise<unknown> =>
        await simS3.deleteObjectTagging(
          command as simS3Commands.SimDeleteObjectTaggingCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
