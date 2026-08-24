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
   * The ARN is the only one CloudFormation publishes. It is the destination's
   * own, and a delivery names that one. The bucket or log group behind it
   * keeps its own ARN, and the two are easy to confuse in a template.
   *
   * `DeliveryDestinationType` is a property of this Resource rather than an
   * attribute of it, so a template reading it back through `Fn::GetAtt` is
   * refused here as CloudFormation refuses it. Read it off the delivery, which
   * does publish it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.#destination.arn;
    }

    throw new Error(
      `Unsupported AWS::Logs::DeliveryDestination attribute ${attributeName}`,
    );
  }
}
