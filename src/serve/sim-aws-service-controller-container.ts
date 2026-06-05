import type { SimAws } from "../service/aws/sim-aws.js";
import type { SimAwsServiceName } from "../service/aws/sim-aws-services.js";
import { SimS3ServiceController } from "../service/s3/serve/sim-s3-controller.js";
import { Memo } from "../util/memo/memo.js";
import type {
  SimAwsServiceController,
  SimAwsServiceControllerFactory,
} from "./sim-service-controller.js";

/**
 * Registry for simulated AWS localhost service controllers.
 */
export class SimAwsServiceControllerContainer {
  private readonly controllers = new Memo<SimAwsServiceController>();

  private readonly controllerFactories = new Map<
    SimAwsServiceName,
    SimAwsServiceControllerFactory
  >([
    [
      "s3",
      (simAws: SimAws): SimS3ServiceController =>
        new SimS3ServiceController(simAws),
    ],
  ]);

  constructor(private readonly simAws: SimAws) {}

  /**
   * Get the singleton controller for a simulated AWS service.
   */
  controllerForService(service: SimAwsServiceName): SimAwsServiceController {
    const factory = this.controllerFactories.get(service);

    if (factory === undefined) {
      throw new Error(
        `No controller implemented for simulated AWS service ${service}`,
      );
    }

    return this.controllers.getOrCreate(service, () => factory(this.simAws));
  }
}
