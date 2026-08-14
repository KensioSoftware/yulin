import type { SimAws } from "../../aws/sim-aws.js";
import type {
  SimEventBridgeDeliveryRequest,
  SimEventBridgeDeliveryTargets,
} from "./sim-event-bridge-delivery.js";
import { SimEventBridgeDeliveryFunction } from "./sim-event-bridge-delivery-function.js";
import { SimEventBridgeDeliveryQueue } from "./sim-event-bridge-delivery-queue.js";
import { SimEventBridgeDeliveryTopic } from "./sim-event-bridge-delivery-topic.js";
import type { SimEventTargetService } from "../target/sim-event-target-arn.js";

interface SimAwsEventBridgeDeliveryTargetsProperties {
  readonly simAws: SimAws;
}

/**
 * Everywhere the rules of one simulated AWS instance can send events.
 *
 * The target is looked up when an event is delivered, never when this is
 * built: reaching another service while this one is being constructed is a
 * cycle with no bottom to it.
 *
 * A target in another Account or Region is allowed, since real EventBridge
 * delivers to both, and it is the target's own Account that decides whether
 * the delivery is permitted.
 */
export class SimAwsEventBridgeDeliveryTargets implements SimEventBridgeDeliveryTargets {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsEventBridgeDeliveryTargetsProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Send one event to the target its ARN names.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    const arn = request.target.arn;
    const scope = this.simAws.accountRegionScope(arn.accountId, arn.regionName);

    await this.deliverTo(arn.service, { request, scope });
  }

  /**
   * Hand the delivery to the one destination that knows this service.
   */
  private async deliverTo(
    service: SimEventTargetService,
    delivery: {
      readonly request: SimEventBridgeDeliveryRequest;
      readonly scope: ReturnType<SimAws["accountRegionScope"]>;
    },
  ): Promise<void> {
    const { request, scope } = delivery;

    switch (service) {
      case "lambda": {
        await new SimEventBridgeDeliveryFunction({ scope }).deliver(request);
        return;
      }
      case "sqs": {
        await new SimEventBridgeDeliveryQueue({ scope }).deliver(request);
        return;
      }
      case "sns": {
        await new SimEventBridgeDeliveryTopic({ scope }).deliver(request);
        return;
      }
    }
  }
}
