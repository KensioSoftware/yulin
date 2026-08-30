import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import { simSdkCallerOptions } from "../../../sdk/index.js";
import type * as simS3Commands from "../command/sim-s3-command.types.js";
import type { SimS3 } from "../sim-s3.js";

/**
 * The SDK Commands that act on a Bucket rather than on the Objects in one.
 *
 * Split from the Object routes because the router's length tracks the size of
 * the command surface rather than the complexity of anything in it, and both
 * halves grow a command at a time.
 */
export function simS3SdkBucketRoutes(
  simS3: SimS3,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "CreateBucketCommand",
      async (command, context): Promise<unknown> =>
        await simS3.createBucket(
          command as simS3Commands.SimCreateBucketCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteBucketCommand",
      async (command, context): Promise<unknown> =>
        await simS3.deleteBucket(
          command as simS3Commands.SimDeleteBucketCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "HeadBucketCommand",
      async (command, context): Promise<unknown> =>
        await simS3.headBucket(
          command as simS3Commands.SimHeadBucketCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListBucketsCommand",
      async (command, context): Promise<unknown> =>
        await simS3.listBuckets(
          command as simS3Commands.SimListBucketsCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutBucketPolicyCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putBucketPolicy(
          command as simS3Commands.SimPutBucketPolicyCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetBucketPolicyCommand",
      async (command, context): Promise<unknown> =>
        await simS3.getBucketPolicy(
          command as simS3Commands.SimGetBucketPolicyCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteBucketPolicyCommand",
      async (command, context): Promise<unknown> =>
        await simS3.deleteBucketPolicy(
          command as simS3Commands.SimDeleteBucketPolicyCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutBucketNotificationConfigurationCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putBucketNotificationConfiguration(
          command as simS3Commands.SimPutBucketNotificationConfigurationCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetBucketNotificationConfigurationCommand",
      async (command, context): Promise<unknown> =>
        await simS3.getBucketNotificationConfiguration(
          command as simS3Commands.SimGetBucketNotificationConfigurationCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutBucketLifecycleConfigurationCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putBucketLifecycleConfiguration(
          command as simS3Commands.SimPutBucketLifecycleConfigurationCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetBucketLifecycleConfigurationCommand",
      async (command, context): Promise<unknown> =>
        await simS3.getBucketLifecycleConfiguration(
          command as simS3Commands.SimGetBucketLifecycleConfigurationCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteBucketLifecycleCommand",
      async (command, context): Promise<unknown> =>
        await simS3.deleteBucketLifecycle(
          command as simS3Commands.SimDeleteBucketLifecycleCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutBucketVersioningCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putBucketVersioning(
          command as simS3Commands.SimPutBucketVersioningCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetBucketVersioningCommand",
      async (command, context): Promise<unknown> =>
        await simS3.getBucketVersioning(
          command as simS3Commands.SimGetBucketVersioningCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutBucketWebsiteCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putBucketWebsite(
          command as simS3Commands.SimPutBucketWebsiteCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "PutPublicAccessBlockCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putPublicAccessBlock(
          command as simS3Commands.SimPutPublicAccessBlockCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetPublicAccessBlockCommand",
      async (command, context): Promise<unknown> =>
        await simS3.getPublicAccessBlock(
          command as simS3Commands.SimGetPublicAccessBlockCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeletePublicAccessBlockCommand",
      async (command, context): Promise<unknown> =>
        await simS3.deletePublicAccessBlock(
          command as simS3Commands.SimDeletePublicAccessBlockCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
