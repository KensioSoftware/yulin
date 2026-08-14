import type { SimEventBus } from "../../../../eventbridge/bus/sim-event-bus.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimEventBusCfnProperties {
  readonly bus: SimEventBus;
}

/**
 * CloudFormation-facing values for a simulated event bus.
 */
export class SimEventBusCfn implements SimCfnResourceValueAdapter {
  private readonly bus: SimEventBus;

  constructor(properties: SimEventBusCfnProperties) {
    this.bus = properties.bus;
  }

  /**
   * AWS::Events::EventBus Ref returns the bus name, not its ARN.
   *
   * That is what makes a `Ref` usable straight away as the `EventBusName` of a
   * rule in the same template, which is the common thing to do with one.
   */
  refValue(): SimCfnTemplateValue {
    return this.bus.name.value;
  }

  /**
   * AWS::Events::EventBus attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.bus.arn.value;
      }
      case "Name": {
        return this.bus.name.value;
      }
      default: {
        throw new Error(
          `Unsupported AWS::Events::EventBus attribute ${attributeName}`,
        );
      }
    }
  }
}
