import {
  deleteResultXml,
  encryptionConfigurationXml,
  notificationConfigurationXml,
  publicAccessBlockXml,
} from "./sim-s3-api-configuration-output.js";
import {
  simS3HeadBucketResponse,
  simS3HeadObjectResponse,
} from "./sim-s3-api-head-output.js";
import {
  simS3ListBucketsXml,
  simS3ListObjectsXml,
} from "./sim-s3-api-listing.js";
import { simS3MultipartResponse } from "./sim-s3-api-multipart-output.js";
import {
  simS3CopyObjectXml,
  simS3GetObjectResponse,
} from "./sim-s3-api-object-output.js";

const xmlContentType = { "content-type": "application/xml" };

/**
 * Build the HTTP response an S3 operation's output is sent as.
 *
 * S3 answers in three different ways and which one applies is a property of
 * the operation rather than of its output: a listing answers in XML, a read
 * answers with the Object itself, and a write answers with a status and
 * headers alone.
 */
export async function simS3ApiResponse(
  commandName: string,
  output: unknown,
): Promise<Response> {
  const value = output as Record<string, unknown>;

  switch (commandName) {
    case "ListBucketsCommand": {
      return xml(simS3ListBucketsXml(value));
    }
    case "ListObjectsCommand": {
      return xml(simS3ListObjectsXml(value, 1));
    }
    case "ListObjectsV2Command": {
      return xml(simS3ListObjectsXml(value, 2));
    }
    case "GetObjectCommand": {
      return await simS3GetObjectResponse(value);
    }
    case "GetBucketPolicyCommand": {
      // A Bucket policy is a JSON document, and real S3 answers this one
      // operation with the document itself rather than wrapping it in XML.
      const policy = value["Policy"];

      return new Response(typeof policy === "string" ? policy : "", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    case "GetPublicAccessBlockCommand": {
      return xml(publicAccessBlockXml(value));
    }
    case "GetBucketEncryptionCommand": {
      return xml(encryptionConfigurationXml(value));
    }
    case "GetBucketNotificationConfigurationCommand": {
      return xml(notificationConfigurationXml(value));
    }
    case "DeleteObjectsCommand": {
      return xml(deleteResultXml(value));
    }
    case "HeadObjectCommand": {
      return simS3HeadObjectResponse(value);
    }
    case "HeadBucketCommand": {
      return simS3HeadBucketResponse(value);
    }
    case "CopyObjectCommand": {
      // A copy answers in a document rather than in headers, because real S3
      // holds the connection open while the bytes move and cannot know the
      // ETag by the time it has to send them.
      return xml(simS3CopyObjectXml(value));
    }
    case "PutObjectCommand":
    case "UploadPartCommand": {
      return new Response(undefined, {
        status: 200,
        headers: etagHeader(value["ETag"]),
      });
    }
    case "CreateBucketCommand": {
      return new Response(undefined, { status: 200 });
    }
    default: {
      // The writes and removals that answer with a status and nothing else,
      // and the multipart operations, which answer in documents of their own.
      return (
        simS3MultipartResponse(commandName, value) ??
        new Response(undefined, { status: emptyStatus(commandName) })
      );
    }
  }
}

/**
 * The status an operation with no response body answers with.
 *
 * Real S3 answers a removal `204 No Content` and a configuration write `200`,
 * and a client reads the difference, so the two are kept apart here. Abandoning
 * a multipart upload is a removal, whatever its name starts with.
 */
function emptyStatus(commandName: string): number {
  return commandName === "AbortMultipartUploadCommand" ||
    commandName.startsWith("Delete")
    ? 204
    : 200;
}

/**
 * The ETag header a write answers with, when the operation produced one.
 */
function etagHeader(etag: unknown): Record<string, string> {
  return typeof etag === "string" ? { etag } : {};
}

/**
 * An XML response, which is how S3 answers everything that is not an Object.
 */
function xml(body: string): Response {
  return new Response(body, { status: 200, headers: xmlContentType });
}
