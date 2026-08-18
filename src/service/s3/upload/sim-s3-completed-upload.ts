import {
  SimS3InvalidPart,
  SimS3InvalidPartOrder,
  SimS3MalformedXml,
} from "../error/sim-s3.error.js";
import { SimS3Object } from "../object/s3-object.js";
import {
  simS3MultipartETag,
  simS3UnquotedETag,
} from "../object/s3-object-etag.js";
import type { SimS3MultipartUpload } from "./sim-s3-multipart-upload.js";

/**
 * One part as a completion request names it: the number it was uploaded under
 * and the ETag that upload answered with.
 */
export interface SimS3NamedUploadPart {
  readonly partNumber: number;
  readonly etag?: string | undefined;
}

interface SimS3CompletedUploadProperties {
  readonly upload: SimS3MultipartUpload;
  readonly parts: readonly SimS3NamedUploadPart[];
  readonly completedAt: Date;
}

/**
 * Join the parts a completion names into the Object S3 stores.
 *
 * The completion names the parts rather than S3 assuming them, so a client can
 * finish an upload it sent a part of twice, or abandon a part it decided not to
 * use. Every part it names has to be one that was uploaded, because an Object
 * assembled from the parts that happened to be there would be quietly missing
 * whatever went astray.
 *
 * The result carries the multipart ETag rather than the MD5 of the joined
 * bytes. See `simS3MultipartETag`.
 */
export function simS3CompletedUploadObject(
  properties: SimS3CompletedUploadProperties,
): SimS3Object {
  const { upload, parts } = properties;

  if (parts.length === 0) {
    throw new SimS3MalformedXml(
      `The completion of upload ${upload.uploadId} names no parts. S3 takes ` +
        `the parts to join from the request rather than assuming every part ` +
        `it holds.`,
    );
  }

  assertAscending(parts);

  const stored = parts.map((named) => storedPart(upload, named));

  return new SimS3Object({
    key: upload.key,
    body: Buffer.concat(stored.map((part) => part.body)),
    metadata: upload.metadata,
    lastModified: properties.completedAt,
    etag: simS3MultipartETag(stored.map((part) => part.etag)),
  });
}

/**
 * Refuse a completion listing its parts out of order.
 *
 * The parts themselves can be uploaded in any order, and `aws s3 cp` routinely
 * finishes a later one first. It is the list in the completion request that
 * real S3 requires to ascend, and it says so rather than sorting.
 */
function assertAscending(parts: readonly SimS3NamedUploadPart[]): void {
  for (const [index, part] of parts.entries()) {
    const previous = parts[index - 1];

    if (previous !== undefined && previous.partNumber >= part.partNumber) {
      throw new SimS3InvalidPartOrder(
        `The parts of a completed multipart upload must be listed in ` +
          `ascending part number order. Part ${part.partNumber} is listed ` +
          `after part ${previous.partNumber}.`,
      );
    }
  }
}

/**
 * The stored part a completion names, or S3's refusal to complete without it.
 *
 * A completion carries the ETag each `UploadPart` answered with, so a mismatch
 * means the client is naming a part other than the one S3 holds under that
 * number.
 */
function storedPart(
  upload: SimS3MultipartUpload,
  named: SimS3NamedUploadPart,
): { readonly body: Buffer; readonly etag: string } {
  const stored = upload.getPart(named.partNumber);

  if (stored === undefined) {
    throw new SimS3InvalidPart(
      `Upload ${upload.uploadId} has no part ${named.partNumber}.`,
    );
  }

  const namedETag =
    named.etag === undefined ? undefined : simS3UnquotedETag(named.etag);

  if (namedETag !== undefined && namedETag !== stored.etag) {
    throw new SimS3InvalidPart(
      `Part ${named.partNumber} of upload ${upload.uploadId} was stored with ` +
        `ETag ${stored.etag}, not the ${namedETag} the completion names.`,
    );
  }

  return stored;
}
