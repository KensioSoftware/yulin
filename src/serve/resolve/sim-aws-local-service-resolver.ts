import type { SimAwsServiceTarget } from "../controller/sim-service-controller.js";
import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import { SimAwsLocalUrl } from "../http/sim-aws-local-url.js";

const s3WebsiteServiceLabel = "s3-website";

/**
 * Default resolver for localhost subdomains to simulated AWS services.
 */
export class SimAwsLocalServiceResolver {
  /**
   * Resolve a localhost subdomain hostname to a simulated AWS service target.
   */
  resolveHost(hostname: string): SimAwsServiceTarget | undefined {
    return this.builtinLocalhostServiceTarget(hostname);
  }

  private builtinLocalhostServiceTarget(
    hostname: string,
  ): SimAwsServiceTarget | undefined {
    if (!hostname.endsWith(SimAwsLocalUrl.localhostSuffix)) {
      return undefined;
    }

    const labels = hostname
      .slice(0, -SimAwsLocalUrl.localhostSuffix.length)
      .split(".");

    if (labels.length < 3) {
      return undefined;
    }

    const service = labels.at(-2);
    const regionName = labels.at(-1) as AwsRegionName | undefined;

    if (service === s3WebsiteServiceLabel && regionName !== undefined) {
      const resourceName = labels.slice(0, -2).join(".");

      if (resourceName.length === 0 || regionName.length === 0) {
        return undefined;
      }

      return {
        service: "s3",
        resourceName,
        regionName,
      };
    }

    return undefined;
  }
}
