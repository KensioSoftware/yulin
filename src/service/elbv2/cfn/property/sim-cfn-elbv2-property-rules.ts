import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

interface SimCfnElbV2PropertyRulesProperties {
  /** The Resource type these rules are about, e.g. `LoadBalancer`. */
  readonly resourceTypeName: string;
  /** What that Resource is called in a sentence, e.g. `load balancer`. */
  readonly described: string;
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
  /** The properties the Resource is created with. */
  readonly actedOn: ReadonlySet<string>;
  /** The real properties this simulation has nothing to act on, and why. */
  readonly unsimulated: ReadonlyMap<string, string>;
}

/**
 * What an ELBv2 Resource is created without acting on.
 *
 * The four ELBv2 Resource types each declare plenty this simulation has no
 * network to apply, so each of them names its own two lists and the walk over
 * a template's properties is written once here.
 *
 * A declared property is never a reason to fail a deployment. A stack that
 * will not deploy is worth less to a test than a load balancer that holds no
 * subnets it was never going to hold, so what is not acted on is recorded and
 * the Resource is created without it.
 */
export class SimCfnElbV2PropertyRules {
  private readonly resourceTypeName: string;
  private readonly described: string;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;
  private readonly actedOn: ReadonlySet<string>;
  private readonly unsimulated: ReadonlyMap<string, string>;

  constructor(properties: SimCfnElbV2PropertyRulesProperties) {
    this.resourceTypeName = properties.resourceTypeName;
    this.described = properties.described;
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
    this.actedOn = properties.actedOn;
    this.unsimulated = properties.unsimulated;
  }

  /**
   * Record every property the Resource is created without.
   */
  apply(): void {
    for (const name of Object.keys(this.properties)) {
      this.applyToProperty(name);
    }
  }

  private applyToProperty(name: string): void {
    if (this.actedOn.has(name)) {
      return;
    }

    const unsimulatedReason = this.unsimulated.get(name);

    if (unsimulatedReason === undefined) {
      this.ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated ELBv2 knows about, so the ` +
          `${this.described} is created without it`,
      );

      return;
    }

    this.ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::ElasticLoadBalancingV2::${this.resourceTypeName} property simulated ELBv2 does not act on: ${unsimulatedReason}`,
    );
  }
}
