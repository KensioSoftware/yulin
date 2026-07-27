import type { SimS3ObjectAddress } from "./sim-s3-object-address.js";
import {
  type SimS3RouteFailure,
  simS3RouteFailure as failure,
} from "./sim-s3-route.js";

const restMethods = new Set(["GET", "HEAD", "PUT"]);

/**
 * Whether a REST request asks for something simulated S3 does not serve.
 */
export function simS3RestRefusal(
  method: string,
  address: SimS3ObjectAddress,
): SimS3RouteFailure | undefined {
  if (!restMethods.has(method)) {
    return failure(
      501,
      `Simulated S3 does not serve ${method} over its REST endpoint. ` +
        `GET, HEAD and PUT of an Object are simulated.\n`,
    );
  }

  if (address.objectKey.length === 0) {
    return failure(
      501,
      `Simulated S3 serves Object requests over its REST endpoint, and this ` +
        `request names Bucket ${address.bucketName} with no Object key. ` +
        `Bucket operations are not served over HTTP.\n`,
    );
  }

  return undefined;
}
