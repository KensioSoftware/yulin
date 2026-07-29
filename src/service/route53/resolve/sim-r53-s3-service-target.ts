import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";

const s3WebsiteServiceLabel = "s3-website";
const s3RestServiceLabel = "s3";

/**
 * Maps Yulin-local S3 hostnames to simulated S3 service targets.
 *
 * S3 is the one simulated service with two endpoints, and its REST endpoint
 * has two hostname styles, so all of that hostname matching is here rather
 * than alongside the services that have one form each.
 */
export class SimRoute53S3ServiceTargets {
  /**
   * Convert a logical S3 hostname into a simulated S3 service target.
   */
  resolve(logicalName: string): SimAwsServiceTarget | undefined {
    return this.websiteTarget(logicalName) ?? this.restTarget(logicalName);
  }

  /**
   * Resolve S3 website endpoint hostnames.
   *
   * Simulated S3 website hostnames use:
   *
   *   <bucket-name>.s3-website.<region>
   *
   * The bucket name can contain dots, so all labels before the service and region
   * labels are joined back together as the resource name.
   */
  private websiteTarget(logicalName: string): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    if (labels.length < 3) {
      return undefined;
    }

    const service = labels.at(-2);
    const regionName = labels.at(-1) as AwsRegionName | undefined;

    if (service !== s3WebsiteServiceLabel || regionName === undefined) {
      return undefined;
    }

    const resourceName = labels.slice(0, -2).join(".");

    /* v8 ignore if -- defensive check */
    if (resourceName.length === 0 || regionName.length === 0) {
      return undefined;
    }

    return {
      service: "s3",
      resourceName,
      regionName,
      endpoint: "website",
    };
  }

  /**
   * Resolve S3 REST API endpoint hostnames.
   *
   * Simulated S3 REST hostnames use either of the two forms real S3 offers:
   *
   *   <bucket-name>.s3.<region>    virtual-hosted style
   *   s3.<region>                  path style, naming the Bucket in the path
   *
   * Both are needed because the AWS SDK chooses between them for itself. A
   * Bucket name containing dots cannot be a single host label, so the SDK falls
   * back to path style for those, and a URL signed one way cannot be served the
   * other.
   */
  private restTarget(logicalName: string): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    if (labels.length < 2) {
      return undefined;
    }

    const service = labels.at(-2);
    const regionName = labels.at(-1) as AwsRegionName | undefined;

    if (service !== s3RestServiceLabel || regionName === undefined) {
      return undefined;
    }

    /* v8 ignore if -- empty labels are rejected before resolution */
    if (regionName.length === 0) {
      return undefined;
    }

    return {
      service: "s3",
      // Empty for path style, where the Bucket is the first path segment.
      resourceName: labels.slice(0, -2).join("."),
      regionName,
      endpoint: "rest",
    };
  }
}
