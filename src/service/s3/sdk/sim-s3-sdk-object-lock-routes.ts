import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import { simSdkCallerOptions } from "../../../sdk/index.js";
import type * as simS3Commands from "../command/sim-s3-command.types.js";
import type { SimS3 } from "../sim-s3.js";

/**
 * The SDK Commands that lock a Bucket and hold the versions in it.
 *
 * Two configure the Bucket and two hold one version each, and they route
 * together because a version can only be held on a Bucket the first two turned
 * Object Lock on for.
 */
export function simS3SdkObjectLockRoutes(
  simS3: SimS3,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "PutObjectLockConfigurationCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putObjectLockConfiguration(
          command as simS3Commands.SimPutObjectLockConfigurationCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetObjectLockConfigurationCommand",
      async (command, context): Promise<unknown> =>
        await simS3.getObjectLockConfiguration(
          command as simS3Commands.SimGetObjectLockConfigurationCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutObjectRetentionCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putObjectRetention(
          command as simS3Commands.SimPutObjectRetentionCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutObjectLegalHoldCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putObjectLegalHold(
          command as simS3Commands.SimPutObjectLegalHoldCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
