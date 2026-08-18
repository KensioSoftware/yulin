import { xmlDocument, xmlValue } from "../../../../util/xml/xml-writer.js";
import {
  simS3ListPartsXml,
  simS3ListUploadsXml,
} from "./sim-s3-api-multipart-listing.js";

interface CreateMultipartUploadOutput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly UploadId?: string | undefined;
}

interface CompleteMultipartUploadOutput {
  readonly Location?: string | undefined;
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly ETag?: string | undefined;
}

/**
 * The response one of the multipart upload operations answers with, or nothing
 * when the operation is not one of them.
 *
 * Four of the six answer in an XML document. `UploadPart` answers with an ETag
 * header and `AbortMultipartUpload` with a status alone, so those two are left
 * to the paths that already build those responses.
 */
export function simS3MultipartResponse(
  commandName: string,
  output: Record<string, unknown>,
): Response | undefined {
  const document = multipartXml(commandName, output);

  return document === undefined
    ? undefined
    : new Response(document, {
        status: 200,
        headers: { "content-type": "application/xml" },
      });
}

/**
 * The document one of them answers with, if it answers with one.
 */
function multipartXml(
  commandName: string,
  output: Record<string, unknown>,
): string | undefined {
  switch (commandName) {
    case "CreateMultipartUploadCommand": {
      return initiateUploadXml(output);
    }
    case "CompleteMultipartUploadCommand": {
      return completedUploadXml(output);
    }
    case "ListMultipartUploadsCommand": {
      return simS3ListUploadsXml(output);
    }
    case "ListPartsCommand": {
      return simS3ListPartsXml(output);
    }
    default: {
      return undefined;
    }
  }
}

/**
 * The document a started upload answers with.
 *
 * S3 names it after the operation's older name, `InitiateMultipartUploadResult`,
 * which is what an SDK still parses for.
 */
function initiateUploadXml(output: CreateMultipartUploadOutput): string {
  return xmlDocument(
    "InitiateMultipartUploadResult",
    xmlValue("Bucket", output.Bucket) +
      xmlValue("Key", output.Key) +
      xmlValue("UploadId", output.UploadId),
  );
}

/**
 * The document a completed upload answers with.
 */
function completedUploadXml(output: CompleteMultipartUploadOutput): string {
  return xmlDocument(
    "CompleteMultipartUploadResult",
    xmlValue("Location", output.Location) +
      xmlValue("Bucket", output.Bucket) +
      xmlValue("Key", output.Key) +
      xmlValue("ETag", output.ETag),
  );
}
