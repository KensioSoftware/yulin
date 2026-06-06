import type { SimAws } from "../../service/aws/sim-aws.js";
import { Memo } from "../../util/memo/memo.js";
import type { SimAwsServiceController } from "./sim-service-controller.js";

/**
 * Registry for simulated AWS localhost service controllers.
 */
export class SimAwsServiceControllerContainer {
  private readonly controllers = new Memo<SimAwsServiceController>();

  constructor(private readonly simAws: SimAws) {}

  /**
   * Get the singleton controller for a simulated AWS service.
   */
  controllerForService(service: string): SimAwsServiceController {
    return this.controllers.getOrCreate(service, () =>
      this.simAws.createServiceController(service),
    );
  }
}
