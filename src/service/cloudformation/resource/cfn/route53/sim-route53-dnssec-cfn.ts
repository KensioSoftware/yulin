import type { SimRoute53HostedZone } from "../../../../route53/hosted-zone/sim-route53-hosted-zone.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRoute53DnssecCfnProperties {
  readonly hostedZone: SimRoute53HostedZone;
}

/**
 * CloudFormation-facing values for DNSSEC signing on a simulated Hosted Zone.
 */
export class SimRoute53DnssecCfn implements SimCfnResourceValueAdapter {
  private readonly hostedZone: SimRoute53HostedZone;

  constructor(properties: SimRoute53DnssecCfnProperties) {
    this.hostedZone = properties.hostedZone;
  }

  /**
   * AWS::Route53::DNSSEC Ref returns the hosted zone ID, which is the whole of
   * the Resource's identity: it holds nothing of its own beyond the zone it
   * turns signing on for.
   */
  refValue(): SimCfnTemplateValue {
    return this.hostedZone.id;
  }

  /**
   * AWS::Route53::DNSSEC has no Fn::GetAtt attributes, so one is refused
   * rather than answered with something invented.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::Route53::DNSSEC attribute ${attributeName}`,
    );
  }
}
