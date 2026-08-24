import type { SimLogsDeliveryDestination } from "../../../../logs/delivery/sim-logs-delivery-destination.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLogsDeliveryDestinationCfnProperties {
  readonly destination: SimLogsDeliveryDestination;
}

/**
 * CloudFormation-facing values for a simulated delivery destination.
 */
export class SimLogsDeliveryDestinationCfn implements SimCfnResourceValueAdapter {
  readonly #destination: SimLogsDeliveryDestination;

  constructor(properties: SimLogsDeliveryDestinationCfnProperties) {
    this.#destination = properties.destination;
  }

  /**
   * AWS::Logs::DeliveryDestination Ref returns the destination name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#destination.name;
  }

  /**
   * AWS::Logs::DeliveryDestination attributes.
   *
   * The ARN here is the destination's own, and a delivery names that one. The
   * bucket or log group behind it keeps its own ARN, and the two are easy to
   * confuse in a template.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.#destination.arn;
      }
      case "DeliveryDestinationType": {
        return this.#destination.destinationType;
      }
      default: {
        throw new Error(
          `Unsupported AWS::Logs::DeliveryDestination attribute ${attributeName}`,
        );
      }
    }
  }
}
