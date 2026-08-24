import type {
  SimSdkCallerOptions,
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import { simSdkCallerOptions, simSdkStreamBody } from "../../../sdk/index.js";
import type * as simS3Commands from "../command/sim-s3-command.types.js";
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
            command as simS3Commands.SimCreateBucketCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CopyObjectCommand",
        async (command, context): Promise<unknown> =>
          await simS3.copyObject(
            command as simS3Commands.SimCopyObjectCommand,
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
        "DeleteBucketPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteBucketPolicy(
            command as simS3Commands.SimDeleteBucketPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteObjectCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteObject(
            command as simS3Commands.SimDeleteObjectCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteObjectsCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteObjects(
            command as simS3Commands.SimDeleteObjectsCommand,
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
        "HeadBucketCommand",
        async (command, context): Promise<unknown> =>
          await simS3.headBucket(
            command as simS3Commands.SimHeadBucketCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "HeadObjectCommand",
        async (command, context): Promise<unknown> =>
          await simS3.headObject(
            command as simS3Commands.SimHeadObjectCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetObjectCommand",
        async (command, context): Promise<unknown> =>
          await getObjectWithSdkStreamBody(
            simS3,
            command as simS3Commands.SimGetObjectCommand,
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
        "ListObjectsCommand",
        async (command, context): Promise<unknown> =>
          await simS3.listObjects(
            command as simS3Commands.SimListObjectsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListObjectsV2Command",
        async (command, context): Promise<unknown> =>
          await simS3.listObjectsV2(
            command as simS3Commands.SimListObjectsV2Command,
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
      [
        "PutObjectCommand",
        async (command, context): Promise<unknown> =>
          await simS3.putObject(
            command as simS3Commands.SimPutObjectCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateMultipartUploadCommand",
        async (command, context): Promise<unknown> =>
          await simS3.createMultipartUpload(
            command as simS3Commands.SimCreateMultipartUploadCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UploadPartCommand",
        async (command, context): Promise<unknown> =>
          await simS3.uploadPart(
            command as simS3Commands.SimUploadPartCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CompleteMultipartUploadCommand",
        async (command, context): Promise<unknown> =>
          await simS3.completeMultipartUpload(
            command as simS3Commands.SimCompleteMultipartUploadCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "AbortMultipartUploadCommand",
        async (command, context): Promise<unknown> =>
          await simS3.abortMultipartUpload(
            command as simS3Commands.SimAbortMultipartUploadCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListMultipartUploadsCommand",
        async (command, context): Promise<unknown> =>
          await simS3.listMultipartUploads(
            command as simS3Commands.SimListMultipartUploadsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListPartsCommand",
        async (command, context): Promise<unknown> =>
          await simS3.listParts(
            command as simS3Commands.SimListPartsCommand,
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
  command: simS3Commands.SimGetObjectCommand,
  options: SimSdkCallerOptions | undefined,
): Promise<simS3Commands.SimGetObjectCommandOutput> {
  const output = await simS3.getObject(command, options);
  if (output.Body === undefined) {
    return output;
  }
  return { ...output, Body: simSdkStreamBody(output.Body) };
}
