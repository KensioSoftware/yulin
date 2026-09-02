import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimPutObjectCommandInput } from "../command/put-object/put-object.command.js";
import { simS3WriteMetadataHeaders } from "../object/s3-write-metadata.js";
import type { SimS3RestObjectRoute } from "./sim-s3-route.js";
import { SimS3UploadChecksum } from "./sim-s3-upload-checksum.js";

/**
 * The write an upload over the S3 REST endpoint asks for.
 *
 * A presigned `PUT` states everything about the Object in its headers, since
 * that is the only place it has to put anything. The metadata headers are read
 * by the same list a `PutObjectCommand` sets them with, so an upload here can
 * describe an Object as fully as an in-process write can. A static site upload
 * usually wants `cache-control` and `content-disposition`.
 *
 * The stated checksum is checked while the request is read, as real S3 checks
 * it before storing anything, so an upload that would be refused there is
 * refused here instead of quietly landing in the Bucket.
 *
 * `x-amz-tagging` is read alongside them, being the tags S3 holds against the
 * Object rather than metadata it hands back on a read.
 */
export function simS3RestUploadInput(
  route: SimS3RestObjectRoute,
  serviceRequest: SimAwsServiceRequest,
): SimPutObjectCommandInput {
  const { request, body } = serviceRequest;

  SimS3UploadChecksum.stated(new URL(request.url), request.headers)?.check(
    body,
  );

  const tagging = request.headers.get("x-amz-tagging");

  return {
    Bucket: route.bucket.bucketName,
    Key: route.objectKey,
    Body: body ?? new Uint8Array(),
    ...simS3WriteMetadataHeaders(request.headers),
    ...(tagging !== null && { Tagging: tagging }),
  };
}
