import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { lambdaFunctionUrlHostLabel } from "../../lambda/function/url/sim-lambda-function-url-host.js";
import { simRoute53LogicalName } from "../local-name/sim-route53-local-name.js";
import { simRoute53DnsHostName } from "../serve/sim-route53-dns-host.js";

const s3WebsiteServiceLabel = "s3-website";
const cloudFrontServiceLabel = "cloudfront";

/**
 * Maps Yulin-local service hostnames to simulated AWS service targets.
 *
 * Route53 resolution can end in one of two ways:
 *
 * 1. A record chain points at another Route53 name and resolution continues.
 * 2. A record chain reaches a hostname that is owned by a simulated AWS service.
 *
 * This class handles the second case. Keeping these hostname formats here makes
 * the Route53 resolver easier to read because the resolver only has to follow
 * records and ask this mapper whether the current name is a terminal service
 * target.
 */
export class SimRoute53ServiceTargetResolver {
  /**
   * Convert a Yulin-local hostname into a simulated service target.
   *
   * The incoming hostname may include the local Route53 suffix used by the HTTP
   * server. `simRoute53LogicalName` strips that suffix and returns the logical DNS
   * name that simulated AWS services expose.
   */
  resolve(hostname: string): SimAwsServiceTarget | undefined {
    const logicalName = simRoute53LogicalName(hostname);
    /* v8 ignore if -- defensive check */
    if (logicalName === undefined) {
      return undefined;
    }

    return (
      this.route53DnsServiceTarget(logicalName) ??
      this.s3WebsiteServiceTarget(logicalName) ??
      this.cloudFrontServiceTarget(logicalName) ??
      this.lambdaFunctionUrlServiceTarget(logicalName)
    );
  }

  /**
   * Resolve Yulin's own Route53 introspection hostname.
   *
   * This is checked first so the hosted-zone summary stays reachable whatever
   * records a test has created, in the same way the built-in service hostnames
   * below cannot be shadowed by hosted-zone records.
   */
  private route53DnsServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    if (logicalName !== simRoute53DnsHostName) {
      return undefined;
    }

    return {
      service: "route53",
      resourceName: simRoute53DnsHostName,
    };
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
  private s3WebsiteServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
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
    };
  }

  /**
   * Resolve CloudFront distribution hostnames.
   *
   * Simulated CloudFront hostnames use:
   *
   *   <distribution-id>.cloudfront.net
   *
   * Unlike S3 bucket website names, this format has an exact label count because
   * the distribution id is represented by one DNS label.
   */
  private cloudFrontServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    if (labels.length !== 3) {
      return undefined;
    }

    const [distroId, service, topLevelDomain] = labels;

    if (service !== cloudFrontServiceLabel || topLevelDomain !== "net") {
      return undefined;
    }

    /* v8 ignore if -- defensive check */
    if (distroId === undefined || distroId.length === 0) {
      return undefined;
    }

    return {
      service: "cloudFront",
      resourceName: distroId,
    };
  }

  /**
   * Resolve Lambda Function URL hostnames.
   *
   * Simulated Function URL hostnames use:
   *
   *   <url-id>.lambda-url.<region>
   *
   * The real AWS endpoint ends `.on.aws`, which the local URL rewriting drops
   * in the same way it drops `.amazonaws.com` from S3 endpoints. The URL id is
   * one DNS label, so the label count here is exact.
   */
  private lambdaFunctionUrlServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    if (labels.length !== 3) {
      return undefined;
    }

    const [urlId, service, regionName] = labels;

    if (service !== lambdaFunctionUrlHostLabel || regionName === undefined) {
      return undefined;
    }

    /* v8 ignore if -- defensive check */
    if (urlId === undefined || urlId.length === 0) {
      return undefined;
    }

    return {
      service: "lambda",
      resourceName: urlId,
      regionName: regionName as AwsRegionName,
    };
  }
}
