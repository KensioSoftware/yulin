import { SimAwsServiceControllerFactory } from "../factory/sim-aws-service-controller-factory.js";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { Memo } from "../../../util/memo/memo.js";
import type { SimAwsServiceController } from "../sim-service-controller.js";

interface SimAwsServiceControllerContainerProps {
  readonly simAws?: SimAws;
}

/**
 * Registry for simulated AWS localhost service controllers.
 *
 * The container owns controller lifetime. It returns one memoized controller
 * instance per simulated AWS service name.
 */
export class SimAwsServiceControllerContainer {
  private readonly controllerFactory: SimAwsServiceControllerFactory;
  private readonly controllers = new Memo<SimAwsServiceController>();

  constructor(props: SimAwsServiceControllerContainerProps = {}) {
    const { simAws = new SimAws() } = props;
    this.controllerFactory = new SimAwsServiceControllerFactory(simAws);
  }

  /**
   * Get the singleton controller for a simulated AWS service.
   */
  controllerForService(service: string): SimAwsServiceController {
    return this.controllers.getOrCreate(service, () =>
      this.controllerFactory.create(service),
    );
  }
}
