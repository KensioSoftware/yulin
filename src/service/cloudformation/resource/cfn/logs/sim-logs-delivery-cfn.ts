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
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.#delivery.arn;
      }
      case "DeliveryId": {
        return this.#delivery.id;
      }
      case "DeliverySourceName": {
        return this.#delivery.deliverySourceName;
      }
      case "DeliveryDestinationArn": {
        return this.#delivery.deliveryDestinationArn;
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
