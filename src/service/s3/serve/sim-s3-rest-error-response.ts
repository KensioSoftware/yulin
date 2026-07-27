import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { SimS3Error } from "../error/sim-s3.error.js";
import { SimS3ChecksumMismatch } from "../error/sim-s3-checksum.error.js";

interface SimS3RestErrorProperties {
  readonly bucketName: string;
  readonly objectKey: string;
}

/**
 * Turns a refused S3 REST request into the response real S3 answers with.
 *
 * S3 is one of the few AWS services that still answers its REST endpoint in
 * XML rather than JSON, and clients parse it: the AWS SDK reads `Code` out of
 * this document to decide which exception to raise. Answering anything else
 * would leave a simulated failure unrecognisable to the code under test.
 */
export class SimS3RestErrorResponse {
  private readonly bucketName: string;
  private readonly objectKey: string;

  constructor(properties: SimS3RestErrorProperties) {
    this.bucketName = properties.bucketName;
    this.objectKey = properties.objectKey;
  }

  /**
   * Build the response for an error raised while serving an Object request.
   *
   * Anything the simulator does not recognise is re-raised rather than
   * flattened into a plausible S3 error, so a bug in the simulation cannot
   * masquerade as an AWS failure the test then asserts on.
   */
  build(error: unknown): Response {
    if (error instanceof SimIamAccessDenied) {
      return this.xml(403, "AccessDenied", error.message);
    }

    if (error instanceof SimS3ChecksumMismatch) {
      return this.xml(400, error.name, error.message);
    }

    if (error instanceof SimS3Error) {
      return this.xml(
        error.$metadata.httpStatusCode ?? 400,
        error.name,
        error.message,
      );
    }

    throw error;
  }

  private xml(status: number, code: string, message: string): Response {
    const body = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Error>`,
      `  <Code>${escapeXml(code)}</Code>`,
      `  <Message>${escapeXml(message)}</Message>`,
      `  <BucketName>${escapeXml(this.bucketName)}</BucketName>`,
      `  <Key>${escapeXml(this.objectKey)}</Key>`,
      `</Error>`,
      ``,
    ].join("\n");

    return new Response(body, {
      status,
      headers: {
        "content-type": "application/xml",
      },
    });
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
