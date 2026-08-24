import type { SimLogsDeliverySource } from "../../../../logs/delivery/sim-logs-delivery-source.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLogsDeliverySourceCfnProperties {
  readonly source: SimLogsDeliverySource;
}

/**
 * CloudFormation-facing values for a simulated delivery source.
 */
export class SimLogsDeliverySourceCfn implements SimCfnResourceValueAdapter {
  readonly #source: SimLogsDeliverySource;

  constructor(properties: SimLogsDeliverySourceCfnProperties) {
    this.#source = properties.source;
  }

  /**
   * AWS::Logs::DeliverySource Ref returns the delivery source name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#source.name;
  }

  /**
   * AWS::Logs::DeliverySource attributes.
   *
   * `Service` is worked out from the resource ARN rather than declared, so a
   * template reading it back gets what CloudWatch Logs decided the source is
   * for.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.#source.arn;
      }
      case "Service": {
        return this.#source.service;
      }
      case "ResourceArns": {
        return [...this.#source.resourceArns];
      }
      default: {
        throw new Error(
          `Unsupported AWS::Logs::DeliverySource attribute ${attributeName}`,
        );
      }
    }
  }
}
