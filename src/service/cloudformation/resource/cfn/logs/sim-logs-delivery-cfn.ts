import type { SimLogsDelivery } from "../../../../logs/delivery/sim-logs-delivery.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLogsDeliveryCfnProperties {
  readonly delivery: SimLogsDelivery;
}

/**
 * CloudFormation-facing values for a simulated delivery.
 */
export class SimLogsDeliveryCfn implements SimCfnResourceValueAdapter {
  readonly #delivery: SimLogsDelivery;

  constructor(properties: SimLogsDeliveryCfnProperties) {
    this.#delivery = properties.delivery;
  }

  /**
   * AWS::Logs::Delivery Ref returns the delivery ID.
   *
   * CloudWatch Logs issues that ID. A template can predict the physical name
   * of the other two delivery Resources and never this one.
   */
  refValue(): SimCfnTemplateValue {
    return this.#delivery.id;
  }

  /**
   * AWS::Logs::Delivery attributes.
   *
   * These three are the whole of what CloudFormation publishes.
   * `DeliverySourceName` and `DeliveryDestinationArn` are properties of this
   * Resource rather than attributes of it, so a template reading either back
   * through `Fn::GetAtt` is refused here as CloudFormation refuses it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.#delivery.arn;
      }
      case "DeliveryId": {
        return this.#delivery.id;
      }
      case "DeliveryDestinationType": {
        return this.#delivery.deliveryDestinationType;
      }
      default: {
        throw new Error(
          `Unsupported AWS::Logs::Delivery attribute ${attributeName}`,
        );
      }
    }
  }
}
