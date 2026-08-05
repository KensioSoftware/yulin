import type {
  SimSdkCallerOptions,
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import { simSdkCallerOptions, simSdkStreamBody } from "../../../sdk/index.js";
import type { SimCreateBucketCommand } from "../command/create-bucket/create-bucket.command.js";
import type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "../command/get-object/get-object.command.js";
import type { SimListBucketsCommand } from "../command/list-buckets/list-buckets.command.js";
import type { SimListObjectsCommand } from "../command/list-objects/list-objects.command.js";
import type { SimDeleteBucketCommand } from "../command/delete-bucket/delete-bucket.command.js";
import type { SimDeleteBucketPolicyCommand } from "../command/delete-bucket-policy/delete-bucket-policy.command.js";
import type { SimDeleteObjectCommand } from "../command/delete-object/delete-object.command.js";
import type { SimDeleteObjectsCommand } from "../command/delete-objects/delete-objects.command.js";
import type { SimGetBucketNotificationConfigurationCommand } from "../command/get-bucket-notification-configuration/get-bucket-notification-configuration.command.js";
import type { SimGetBucketPolicyCommand } from "../command/get-bucket-policy/get-bucket-policy.command.js";
import type { SimPutBucketNotificationConfigurationCommand } from "../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimPutBucketPolicyCommand } from "../command/put-bucket-policy/put-bucket-policy.command.js";
import type { SimPutBucketWebsiteCommand } from "../command/put-bucket-website/put-bucket-website.command.js";
import type { SimPutObjectCommand } from "../command/put-object/put-object.command.js";
import type { SimPutPublicAccessBlockCommand } from "../command/put-public-access-block/put-public-access-block.command.js";
import type { SimGetPublicAccessBlockCommand } from "../command/get-public-access-block/get-public-access-block.command.js";
import type { SimDeletePublicAccessBlockCommand } from "../command/delete-public-access-block/delete-public-access-block.command.js";
import type { SimS3 } from "../sim-s3.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated S3 instance.
 */
export class SimS3SdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simS3: SimS3) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateBucketCommand",
        async (command, context): Promise<unknown> =>
          await simS3.createBucket(
            command as SimCreateBucketCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteBucketCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteBucket(
            command as SimDeleteBucketCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteBucketPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteBucketPolicy(
            command as SimDeleteBucketPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteObjectCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteObject(
            command as SimDeleteObjectCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteObjectsCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteObjects(
            command as SimDeleteObjectsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetBucketPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simS3.getBucketPolicy(
            command as SimGetBucketPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetObjectCommand",
        async (command, context): Promise<unknown> =>
          await getObjectWithSdkStreamBody(
            simS3,
            command as SimGetObjectCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListBucketsCommand",
        async (command, context): Promise<unknown> =>
          await simS3.listBuckets(
            command as SimListBucketsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListObjectsCommand",
        async (command, context): Promise<unknown> =>
          await simS3.listObjects(
            command as SimListObjectsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutBucketPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simS3.putBucketPolicy(
            command as SimPutBucketPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutBucketNotificationConfigurationCommand",
        async (command, context): Promise<unknown> =>
          await simS3.putBucketNotificationConfiguration(
            command as SimPutBucketNotificationConfigurationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetBucketNotificationConfigurationCommand",
        async (command, context): Promise<unknown> =>
          await simS3.getBucketNotificationConfiguration(
            command as SimGetBucketNotificationConfigurationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutBucketWebsiteCommand",
        async (command, context): Promise<unknown> =>
          await simS3.putBucketWebsite(
            command as SimPutBucketWebsiteCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutPublicAccessBlockCommand",
        async (command, context): Promise<unknown> =>
          await simS3.putPublicAccessBlock(
            command as SimPutPublicAccessBlockCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetPublicAccessBlockCommand",
        async (command, context): Promise<unknown> =>
          await simS3.getPublicAccessBlock(
            command as SimGetPublicAccessBlockCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeletePublicAccessBlockCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deletePublicAccessBlock(
            command as SimDeletePublicAccessBlockCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutObjectCommand",
        async (command, context): Promise<unknown> =>
          await simS3.putObject(
            command as SimPutObjectCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated S3 can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated S3 supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}

/**
 * Get an Object and mix the SDK stream transform methods into its Body, so
 * SDK callers can use e.g. Body.transformToString() as with real S3.
 */
async function getObjectWithSdkStreamBody(
  simS3: SimS3,
  command: SimGetObjectCommand,
  options: SimSdkCallerOptions | undefined,
): Promise<SimGetObjectCommandOutput> {
  const output = await simS3.getObject(command, options);
  if (output.Body === undefined) {
    return output;
  }
  return { ...output, Body: simSdkStreamBody(output.Body) };
}
