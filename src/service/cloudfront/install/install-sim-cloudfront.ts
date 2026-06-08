import type { SimAwsServiceMap } from "../../aws/sim-aws-services.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { SimCloudFront } from "../sim-cloudfront.js";
import { SimCloudFrontRegistry } from "../sim-cloud-front-registry.js";

export interface SimCloudFrontServices {
  cloudFront: SimCloudFront;
}

/**
 * State for one sim CloudFront installation into one sim AWS environment.
 */
class SimCloudFrontInstallation {
  private readonly cloudFrontRegistry = new SimCloudFrontRegistry();

  private readonly cloudFrontServices = new Map<
    SimAwsAccountId,
    SimCloudFront
  >();

  createService(
    scope: SimAwsAccountRegionContainer<SimAwsServiceMap>,
  ): SimCloudFront {
    const { accountId } = scope.accountRegionScope;

    let simCloudFront = this.cloudFrontServices.get(accountId);

    if (simCloudFront === undefined) {
      simCloudFront = new SimCloudFront(
        scope.accountRegionScope,
        this.cloudFrontRegistry,
      );
      this.cloudFrontServices.set(accountId, simCloudFront);
    }

    return simCloudFront;
  }
}

/**
 * Install simulated CloudFront into a simulated AWS environment.
 *
 * Simulated CloudFront is installed into SimAws with this installer pattern so
 * that the root SimAws does not need to know about individual AWS SDKs like
 * aws-sdk/client-cloudfront.
 *
 * Without this separation, the root SimAws module would try to import every
 * AWS SDK, so users would be forced to install all of them.
 */
export function installSimCloudFront<TServices extends SimAwsServiceMap>(
  simAws: SimAws<TServices>,
): asserts simAws is SimAws<TServices & SimCloudFrontServices> {
  const installation = new SimCloudFrontInstallation();

  simAws.installService("cloudFront", (scope) => {
    return installation.createService(scope);
  });

  // TODO
  // simAws.installServiceController("cloudFront", (controllerSimAws) => {
  //   return new SimCloudFrontServiceController(
  //     controllerSimAws,
  //     cloudFrontRegistry,
  //   );
  // });
}
