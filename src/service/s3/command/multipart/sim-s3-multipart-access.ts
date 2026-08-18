import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3NoSuchUpload } from "../../error/sim-s3.error.js";
import type { SimS3MultipartUpload } from "../../upload/sim-s3-multipart-upload.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { SimS3MultipartAuthorizer } from "./sim-s3-multipart-authorizer.js";

export interface SimS3MultipartAccessProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * A Bucket a multipart request has been authorized against.
 */
export interface SimS3AuthorizedBucket {
  readonly bucket: SimS3Bucket;
  readonly caller: SimAwsResolvedCaller;
}

/**
 * Getting at a Bucket's multipart uploads, with permission.
 *
 * The six operations of a multipart upload share the whole of their preamble:
 * find the Bucket or answer NoSuchBucket, let the background scheduler order
 * the request, authorize it, and for the five that name an upload, find that or
 * answer NoSuchUpload. Holding it here is what keeps the six handlers to the
 * one thing each of them actually does.
 */
export class SimS3MultipartAccess {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3MultipartAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimS3MultipartAccessProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3MultipartAuthorizer({ iam });
    this.background = background;
  }

  /**
   * The current time in this simulation, which dates an upload and its parts.
   */
  now(): Date {
    return this.background.now();
  }

  /**
   * Find and authorize the Bucket a multipart request names.
   *
   * The Bucket is looked up before authorization so a request against a Bucket
   * that is not there keeps S3's error, and authorization happens before
   * anything is stored so a denied request cannot leave a part behind. An
   * omitted key is ListMultipartUploads, which names no Object.
   */
  async reach(
    bucketName: string,
    key: string | undefined,
    options?: SimS3RequestOptions,
  ): Promise<SimS3AuthorizedBucket> {
    const bucket = requireSimS3Bucket(
      this.buckets,
      bucketName as SimS3BucketName,
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    return { bucket, caller: this.authorizer.authorize(bucket, key, options) };
  }

  /**
   * The upload a request names, or S3's refusal to act on one it never issued.
   *
   * A completed or aborted upload is as unknown as an invented id, because real
   * S3 keeps nothing about an upload that has stopped being one.
   */
  requireUpload(bucket: SimS3Bucket, uploadId: string): SimS3MultipartUpload {
    const upload = bucket.getMultipartUploads().find(uploadId);

    if (upload === undefined) {
      throw new SimS3NoSuchUpload(
        `Bucket ${bucket.bucketName} has no multipart upload ${uploadId} in ` +
          `progress. An upload that has been completed or aborted is gone.`,
      );
    }

    return upload;
  }
}
