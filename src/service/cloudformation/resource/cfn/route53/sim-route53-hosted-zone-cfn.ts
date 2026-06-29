import type { SimRoute53HostedZone } from "../../../../route53/hosted-zone/sim-route53-hosted-zone.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRoute53HostedZoneCfnProps {
  readonly hostedZone: SimRoute53HostedZone;
}

/**
 * CloudFormation-facing values for a simulated Route53 Hosted Zone.
 */
export class SimRoute53HostedZoneCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly props: SimRoute53HostedZoneCfnProps) {}

  /**
   * AWS::Route53::HostedZone Ref returns the hosted zone ID.
   */
  refValue(): SimCfnTemplateValue {
    return this.props.hostedZone.id;
  }

  /**
   * AWS::Route53::HostedZone attributes supported by the simulator.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Id": {
        return this.props.hostedZone.id;
      }
      case "Name": {
        return this.props.hostedZone.name;
      }
      default: {
        throw new Error(
          `Unsupported AWS::Route53::HostedZone attribute ${attributeName}`,
        );
      }
    }
  }
}
