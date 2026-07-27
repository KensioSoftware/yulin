import type { SimAwsServiceRequest } from "../../../../serve/controller/sim-service-controller.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3WebsiteRoute } from "../sim-s3-route.js";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";
import { SimS3NoSuchKey } from "../../error/sim-s3.error.js";
import type { SimS3 } from "../../sim-s3.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import { SimS3WebsiteObject } from "./sim-s3-website-object.js";

interface SimS3WebsiteObjectLoaderProperties {
  readonly simS3: SimS3;
  readonly bucketName: SimS3BucketName;
  readonly caller: SimAwsCaller;
}

/**
 * Reads Objects for the static website endpoint as the requesting principal.
 *
 * Everything goes through the ordinary GetObject command, so a website request
 * is authorized by the same IAM code path an in-process SDK call goes through.
 * A browser presenting nothing is anonymous, and anonymous holds nothing unless
 * the Bucket policy grants it, which is what makes a Bucket that is not
 * publicly readable answer 403 here as it does in real S3.
 */
export class SimS3WebsiteObjectLoader {
  private readonly simS3: SimS3;
  private readonly bucketName: SimS3BucketName;
  private readonly caller: SimAwsCaller;

  constructor(properties: SimS3WebsiteObjectLoaderProperties) {
    this.simS3 = properties.simS3;
    this.bucketName = properties.bucketName;
    this.caller = properties.caller;
  }

  /**
   * A loader for one routed website request, reading from the scope that owns
   * the Bucket as the principal the boundary resolved.
   */
  static forRoute(
    simAws: SimAws,
    route: SimS3WebsiteRoute,
    serviceRequest: SimAwsServiceRequest,
  ): SimS3WebsiteObjectLoader {
    return new SimS3WebsiteObjectLoader({
      simS3: simAws
        .accountRegionScope(
          route.bucketScope.accountId,
          route.bucketScope.regionName,
        )
        .s3(),
      bucketName: route.bucket.bucketName,
      caller: serviceRequest.caller.toCaller(),
    });
  }

  /**
   * Load an Object, or nothing when the Bucket holds no such key.
   *
   * A denial is raised rather than reported as absence, because the two mean
   * different things to a website visitor: one is 404, the other 403.
   */
  async load(objectKey: string): Promise<SimS3WebsiteObject | undefined> {
    try {
      const output = await this.simS3.getObject(
        { input: { Bucket: this.bucketName, Key: objectKey } },
        { caller: this.caller },
      );

      return new SimS3WebsiteObject(
        await simS3BodyToBuffer(output.Body as AsyncIterable<Buffer>),
        output.Metadata?.["content-type"],
      );
    } catch (error) {
      if (error instanceof SimS3NoSuchKey) {
        return undefined;
      }

      throw error;
    }
  }

  /**
   * Load an Object the site only needs if it is readable, treating a denial as
   * absence.
   *
   * The folder index probe and the error document are looked up to decide what
   * to serve rather than because the visitor asked for them, so a denial on
   * either should fall through to the next option instead of becoming the
   * answer.
   */
  async loadIfPermitted(
    objectKey: string,
  ): Promise<SimS3WebsiteObject | undefined> {
    try {
      return await this.load(objectKey);
    } catch (error) {
      if (error instanceof SimIamAccessDenied) {
        return undefined;
      }

      throw error;
    }
  }
}
