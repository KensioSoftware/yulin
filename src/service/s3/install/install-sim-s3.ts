import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAwsServiceMap } from "../../aws/sim-aws-services.js";
import { SimS3 } from "../sim-s3.js";
import { SimS3GlobalRegistry } from "../sim-s3-global-registry.js";
import { SimS3ServiceController } from "../serve/sim-s3-controller.js";

export { SimS3 } from "../sim-s3.js";

export interface SimS3Services {
  s3: SimS3;
}

/**
 * State for one simulated S3 installation into one simulated AWS environment.
 */
class SimS3Installation {
  private readonly s3GlobalRegistry = new SimS3GlobalRegistry();

  createService(scope: SimAwsAccountRegionContainer<SimAwsServiceMap>): SimS3 {
    return new SimS3(scope.accountRegionScope, this.s3GlobalRegistry);
  }

  createServiceController(
    simAws: SimAws<SimS3Services>,
  ): SimS3ServiceController {
    return new SimS3ServiceController(simAws);
  }
}

/**
 * Install simulated S3 into a simulated AWS environment.
 *
 * Simulated S3 is installed into SimAws with this installer pattern so that
 * the root SimAws does not need to know about individual AWS SDKs like
 * aws-sdk/client-s3.
 *
 * Without this separation, the root SimAws module would try to import every
 * AWS SDK, so users would be forced to install all of them.
 */
export function installSimS3<TServices extends SimAwsServiceMap>(
  simAws: SimAws<TServices>,
): asserts simAws is SimAws<TServices & SimS3Services> {
  const installation = new SimS3Installation();

  simAws.installService("s3", (scope) => {
    return installation.createService(scope);
  });

  simAws.installServiceController("s3", (controllerSimAws) => {
    return installation.createServiceController(
      controllerSimAws as SimAws<SimS3Services>,
    );
  });
}
