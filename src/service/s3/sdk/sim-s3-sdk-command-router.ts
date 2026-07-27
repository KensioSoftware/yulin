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
import type { SimDeleteBucketPolicyCommand } from "../command/delete-bucket-policy/delete-bucket-policy.command.js";
import type { SimGetBucketPolicyCommand } from "../command/get-bucket-policy/get-bucket-policy.command.js";
import type { SimPutBucketPolicyCommand } from "../command/put-bucket-policy/put-bucket-policy.command.js";
import type { SimPutBucketWebsiteCommand } from "../command/put-bucket-website/put-bucket-website.command.js";
import type { SimPutObjectCommand } from "../command/put-object/put-object.command.js";
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
        "DeleteBucketPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simS3.deleteBucketPolicy(
            command as SimDeleteBucketPolicyCommand,
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
        "PutBucketWebsiteCommand",
        async (command, context): Promise<unknown> =>
          await simS3.putBucketWebsite(
            command as SimPutBucketWebsiteCommand,
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
