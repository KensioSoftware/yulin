import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type {
  SimEventBridgeDeadLetterRequest,
  SimEventBridgeDeliveryRequest,
  SimEventBridgeDeliveryTargets,
} from "./sim-event-bridge-delivery.js";
import { SimEventBridgeDeliveryFunction } from "./sim-event-bridge-delivery-function.js";
import { SimEventBridgeDeadLetterQueue } from "./sim-event-bridge-dead-letter-queue.js";
import { SimEventBridgeDeliveryQueue } from "./sim-event-bridge-delivery-queue.js";
import { SimEventBridgeDeliveryTask } from "./sim-event-bridge-delivery-task.js";
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
   * Send an event EventBridge gave up on to the dead-letter queue its target
   * names, in the queue's own Account and Region.
   */
  async deadLetter(request: SimEventBridgeDeadLetterRequest): Promise<void> {
    const config = request.delivery.target.deadLetterConfig;

    assertDefined(config, "A dead letter requires a dead-letter queue");

    const { accountId, regionName, name } = config.queue;
    const scope = this.simAws.accountRegionScope(
      accountId as SimAwsAccountId,
      regionName as AwsRegionName,
    );

    await new SimEventBridgeDeadLetterQueue({ scope }).deliver(request, {
      name,
      arn: config.arn,
    });
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
      case "ecs": {
        await new SimEventBridgeDeliveryTask({ simAws: this.simAws }).deliver(
          request,
        );
        return;
      }
    }
  }
}
