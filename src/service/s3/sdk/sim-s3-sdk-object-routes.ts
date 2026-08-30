import type {
  SimSdkCallerOptions,
  SimSdkCommandRoute,
} from "../../../sdk/index.js";
import { simSdkCallerOptions, simSdkStreamBody } from "../../../sdk/index.js";
import type * as simS3Commands from "../command/sim-s3-command.types.js";
import type { SimS3 } from "../sim-s3.js";

/**
 * The SDK Commands that act on the Objects in a Bucket, the multipart uploads
 * that build one, and the versions a Bucket keeps of them.
 */
export function simS3SdkObjectRoutes(
  simS3: SimS3,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "PutObjectCommand",
      async (command, context): Promise<unknown> =>
        await simS3.putObject(
          command as simS3Commands.SimPutObjectCommand,
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
      "HeadObjectCommand",
      async (command, context): Promise<unknown> =>
        await simS3.headObject(
          command as simS3Commands.SimHeadObjectCommand,
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
      "ListObjectVersionsCommand",
      async (command, context): Promise<unknown> =>
        await simS3.listObjectVersions(
          command as simS3Commands.SimListObjectVersionsCommand,
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
  ];
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
