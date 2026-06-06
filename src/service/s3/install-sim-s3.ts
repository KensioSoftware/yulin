import type { SimAws } from "../aws/sim-aws.js";
import type { SimAwsServiceMap } from "../aws/sim-aws-services.js";
import { SimS3 } from "./sim-s3.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import { SimS3ServiceController } from "./serve/sim-s3-controller.js";

export { SimS3 } from "./sim-s3.js";

export interface SimS3Services {
  s3: SimS3;
}

/**
 * Install simulated S3 into a simulated AWS environment.
 */
export function installSimS3<TServices extends SimAwsServiceMap>(
  simAws: SimAws<TServices>,
): asserts simAws is SimAws<TServices & SimS3Services> {
  const s3GlobalRegistry = new SimS3GlobalRegistry();

  simAws.installService("s3", (scope) => {
    return new SimS3(scope.accountRegionScope, s3GlobalRegistry);
  });

  simAws.installServiceController("s3", (controllerSimAws) => {
    return new SimS3ServiceController(
      controllerSimAws as SimAws<SimS3Services>,
    );
  });
}
