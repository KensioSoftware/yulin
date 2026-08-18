import { simS3ObjectResponseHeaders } from "../../object/s3-object-response-headers.js";
import {
  deleteResultXml,
  notificationConfigurationXml,
  publicAccessBlockXml,
} from "./sim-s3-api-configuration-output.js";
import {
  simS3ListBucketsXml,
  simS3ListObjectsXml,
} from "./sim-s3-api-listing.js";

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
      return await getObjectResponse(value);
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
    case "GetBucketNotificationConfigurationCommand": {
      return xml(notificationConfigurationXml(value));
    }
    case "DeleteObjectsCommand": {
      return xml(deleteResultXml(value));
    }
    case "HeadObjectCommand": {
      return headObjectResponse(value);
    }
    case "HeadBucketCommand": {
      // The Bucket is there and reachable, which the status alone says.
      return new Response(undefined, { status: 200 });
    }
    case "PutObjectCommand": {
      return new Response(undefined, {
        status: 200,
        headers: etagHeader(value["ETag"]),
      });
    }
    case "CreateBucketCommand": {
      return new Response(undefined, { status: 200 });
    }
    default: {
      // The writes and removals that answer with a status and nothing else.
      return new Response(undefined, { status: emptyStatus(commandName) });
    }
  }
}

/**
 * The status an operation with no response body answers with.
 *
 * Real S3 answers a removal `204 No Content` and a configuration write `200`,
 * and a client reads the difference, so the two are kept apart here.
 */
function emptyStatus(commandName: string): number {
  return commandName.startsWith("Delete") ? 204 : 200;
}

/**
 * Answer a read with the Object itself, headers and all.
 */
async function getObjectResponse(
  output: Record<string, unknown>,
): Promise<Response> {
  const body = await objectBodyBytes(output["Body"]);

  return new Response(body, {
    status: 200,
    headers: simS3ObjectResponseHeaders({
      metadata: output["Metadata"] as Record<string, string> | undefined,
      bodyLength: body.length,
      etag: output["ETag"] as string | undefined,
      lastModified: output["LastModified"] as Date | undefined,
    }),
  });
}

/**
 * Answer a HEAD with what a read would have said and none of the Object.
 *
 * HTTP forbids a body on a HEAD response, so everything the caller learns is
 * in the headers, `content-length` included. That length describes the Object
 * rather than the response, which is what makes a HEAD worth sending.
 */
function headObjectResponse(output: Record<string, unknown>): Response {
  return new Response(undefined, {
    status: 200,
    headers: simS3ObjectResponseHeaders({
      metadata: output["Metadata"] as Record<string, string> | undefined,
      bodyLength: (output["ContentLength"] as number | undefined) ?? 0,
      etag: output["ETag"] as string | undefined,
      lastModified: output["LastModified"] as Date | undefined,
    }),
  });
}

/**
 * Read a GetObject body into the bytes an HTTP response carries.
 */
async function objectBodyBytes(body: unknown): Promise<Buffer> {
  /* v8 ignore if -- the loader always answers with a body */
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
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
