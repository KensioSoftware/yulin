import { buffer } from "node:stream/consumers";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { SimRekognitionInvalidS3ObjectException } from "../../error/sim-rekognition.error.js";
import type {
  SimRekognitionImageObjectRequest,
  SimRekognitionImageObjects,
} from "../sim-rekognition-image-objects.js";

interface SimAwsRekognitionImageObjectsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The simulated S3 objects of one simulated AWS instance, as images
 * Rekognition can detect on.
 *
 * The Bucket is found through the S3 Bucket registry rather than through this
 * scope's own S3, so a Bucket owned by another Account resolves, as real
 * Rekognition reads across Accounts given a Bucket policy that allows it.
 * The read itself is an ordinary simulated GetObject made as the caller, so
 * that policy is what decides it.
 */
export class SimAwsRekognitionImageObjects implements SimRekognitionImageObjects {
  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsRekognitionImageObjectsProperties) {
    this.simAws = properties.simAws;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read an image object's bytes.
   *
   * Every way this can fail becomes InvalidS3ObjectException, as it does on
   * real Rekognition, which reports a missing Bucket, a missing object and an
   * object it may not read with the same error. The underlying simulator error
   * is kept as the `cause`, so a missing `s3:GetObject` grant is still
   * diagnosable from the error that was thrown.
   */
  async read(request: SimRekognitionImageObjectRequest): Promise<Uint8Array> {
    const bucketScope = this.requireBucketScope(request);

    try {
      return await this.getObjectBytes(bucketScope, request);
    } catch (error) {
      throw new SimRekognitionInvalidS3ObjectException(
        `${this.unableToGet(request)} (${String(error)})`,
        { cause: error },
      );
    }
  }

  /**
   * Where the named Bucket lives, refusing one this Region cannot reach.
   *
   * Real Rekognition reads a Bucket in its own Region only, and reports one
   * in another Region as an S3 object problem rather than as a request
   * problem. The message says which Region the Bucket is in, because that is
   * the part a caller cannot see from the request.
   */
  private requireBucketScope(
    request: SimRekognitionImageObjectRequest,
  ): SimAwsAccountRegionScope {
    const bucketScope = this.simAws.s3().findBucketScope(request.bucketName);

    if (bucketScope === undefined) {
      throw new SimRekognitionInvalidS3ObjectException(
        `${this.unableToGet(request)} (no simulated Bucket is named ` +
          `${request.bucketName})`,
      );
    }

    if (bucketScope.regionName !== this.accountRegionScope.regionName) {
      throw new SimRekognitionInvalidS3ObjectException(
        `${this.unableToGet(request)} (the Bucket is in ` +
          `${bucketScope.regionName} and Rekognition is in ` +
          `${this.accountRegionScope.regionName}, and Rekognition reads only ` +
          `Buckets in its own Region)`,
      );
    }

    return bucketScope;
  }

  private async getObjectBytes(
    bucketScope: SimAwsAccountRegionScope,
    request: SimRekognitionImageObjectRequest,
  ): Promise<Uint8Array> {
    const s3 = this.simAws
      .accountRegionScope(bucketScope.accountId, bucketScope.regionName)
      .s3();

    const output = await s3.getObject(
      { input: { Bucket: request.bucketName, Key: request.objectName } },
      request.caller === undefined ? undefined : { caller: request.caller },
    );

    assertDefined(
      output.Body,
      `s3://${request.bucketName}/${request.objectName} has no body`,
    );

    return await buffer(output.Body);
  }

  /**
   * The message real Rekognition reports every S3 failure with.
   */
  private unableToGet(request: SimRekognitionImageObjectRequest): string {
    return (
      `Unable to get object metadata from S3 for ` +
      `s3://${request.bucketName}/${request.objectName}. Check object key, ` +
      `region and/or access permissions.`
    );
  }
}
