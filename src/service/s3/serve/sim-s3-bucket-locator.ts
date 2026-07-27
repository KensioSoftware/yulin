import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimS3Bucket, SimS3BucketName } from "../bucket/sim-s3-bucket.js";

/**
 * A Bucket found by name, with the Account and Region scope that owns it.
 */
export class SimS3BucketLocation {
  constructor(
    public readonly bucket: SimS3Bucket,
    public readonly bucketScope: SimAwsAccountRegionScope,
  ) {}
}

/**
 * Why a hostname did not lead to a Bucket that can serve the request.
 */
export class SimS3BucketNotFound {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
  ) {}
}

interface SimS3BucketLocatorProperties {
  readonly simAws: SimAws;
}

/**
 * Finds the Bucket a served request names.
 *
 * Bucket names are global in S3 while Buckets themselves live in one Region,
 * so a name is looked up across the simulation and then checked against the
 * Region the hostname claimed. A request for the right Bucket at the wrong
 * Region's endpoint is refused rather than served, as real S3 refuses it.
 */
export class SimS3BucketLocator {
  private readonly simAws: SimAws;

  constructor(properties: SimS3BucketLocatorProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Locate a Bucket by name, in the Region the request reached.
   */
  locate(
    bucketName: SimS3BucketName,
    regionName: string,
  ): SimS3BucketLocation | SimS3BucketNotFound {
    const bucketScope = this.simAws.s3().findBucketScope(bucketName);

    if (bucketScope === undefined) {
      return new SimS3BucketNotFound(
        404,
        `S3 bucket named ${bucketName} not found`,
      );
    }

    if (bucketScope.regionName !== regionName) {
      return new SimS3BucketNotFound(
        404,
        `S3 bucket named ${bucketName} is in region ` +
          `${bucketScope.regionName}, not requested ${regionName}`,
      );
    }

    const bucket = this.simAws
      .accountRegionScope(bucketScope.accountId, bucketScope.regionName)
      .s3()
      .getSimBucketByName(bucketName);

    /* v8 ignore if -- does not happen in practice */
    if (bucket === undefined) {
      return new SimS3BucketNotFound(
        404,
        `S3 bucket named ${bucketName} not found`,
      );
    }

    return new SimS3BucketLocation(bucket, bucketScope);
  }
}
