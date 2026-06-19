import type { SimAwsServiceController } from "../sim-service-controller.js";
import type { SimAws } from "../../../service/aws/sim-aws.js";
import { SimCloudFrontServiceController } from "../../../service/cloudfront/controller/sim-cloudfront-controller.js";
import { SimS3ServiceController } from "../../../service/s3/serve/sim-s3-controller.js";

/**
 * Factory for simulated AWS HTTP service controllers.
 */
export class SimAwsServiceControllerFactory {
  constructor(private readonly simAws: SimAws) {}

  /**
   * Create a simulated AWS HTTP service controller.
   */
  create(serviceName: string): SimAwsServiceController {
    switch (serviceName) {
      case "s3": {
        return new SimS3ServiceController({ simAws: this.simAws });
      }
      case "cloudFront": {
        return new SimCloudFrontServiceController({
          simAws: this.simAws,
        });
      }
      default: {
        throw new Error(
          `No controller for simulated AWS service ${serviceName}`,
        );
      }
    }
  }
}
