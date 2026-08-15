import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCreateLoadBalancerCommandInput } from "../../command/load-balancer/load-balancer.command.js";
import type { SimElbV2Tag } from "../../command/sim-elbv2-shared.command.js";
import { simCfnElbV2GeneratedName } from "../name/sim-cfn-elbv2-name.js";
import type { SimCfnElbV2DeclaredResource } from "../property/sim-cfn-elbv2-declared-resource.js";
import { SimCfnElbV2PropertyReader } from "../property/sim-cfn-elbv2-property-reader.js";
import { SimCfnElbV2PropertyRules } from "../property/sim-cfn-elbv2-property-rules.js";

/**
 * The properties a load balancer is created with.
 */
const actedOnProperties: ReadonlySet<string> = new Set([
  "Name",
  "Scheme",
  "Type",
  "IpAddressType",
  "Tags",
]);

/**
 * The real AWS::ElasticLoadBalancingV2::LoadBalancer properties this
 * simulation has nothing to act on, and why.
 *
 * All of them describe where a load balancer sits on a network, and there is
 * no network here for it to sit on. A load balancer here is reached by its DNS
 * name and nothing else, so a subnet or a security group would be held and
 * never consulted.
 */
const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "Subnets",
    "there is no VPC here, so a load balancer answers on its DNS name " +
      "rather than in a subnet",
  ],
  [
    "SubnetMappings",
    "there is no VPC here, so nothing places a load balancer in a subnet or " +
      "gives it an address there",
  ],
  [
    "SecurityGroups",
    "nothing filters traffic reaching a simulated load balancer, so a " +
      "security group would allow and deny nothing",
  ],
  [
    "LoadBalancerAttributes",
    "the attributes change how a real load balancer handles connections, " +
      "and there are no connections here to handle",
  ],
  [
    "EnforceSecurityGroupInboundRulesOnPrivateLinkTraffic",
    "there are no security groups and no PrivateLink traffic here",
  ],
]);

/**
 * Reads AWS::ElasticLoadBalancingV2::LoadBalancer properties into
 * CreateLoadBalancer input.
 *
 * CloudFormation spells these the way the API does, so this is the name a
 * template left out and a check that what it did declare is the right shape.
 */
export class SimCfnElbV2LoadBalancerProperties {
  private readonly resource: SimCfnResource;
  private readonly reader: SimCfnElbV2PropertyReader;
  private readonly rules: SimCfnElbV2PropertyRules;

  constructor(declared: SimCfnElbV2DeclaredResource) {
    const { resource, properties } = declared;

    this.resource = resource;
    this.reader = new SimCfnElbV2PropertyReader({ resource, properties });
    this.rules = new SimCfnElbV2PropertyRules({
      resourceTypeName: "LoadBalancer",
      described: "load balancer",
      properties,
      ignorer: resource,
      actedOn: actedOnProperties,
      unsimulated: unsimulatedPropertyReasons,
    });
  }

  /**
   * The CreateLoadBalancer input this Resource declares.
   */
  createLoadBalancerInput(): SimCreateLoadBalancerCommandInput {
    return {
      Name: this.name(),
      Scheme: this.reader.text("Scheme"),
      Type: this.reader.text("Type"),
      IpAddressType: this.reader.text("IpAddressType"),
      Tags: this.reader.structures<SimElbV2Tag>("Tags"),
    };
  }

  /**
   * The load balancer name.
   *
   * An unnamed load balancer is named after the stack and the logical ID, as
   * real CloudFormation names one, minus the random part so a test can predict
   * it.
   */
  name(): string {
    return this.reader.text("Name") ?? simCfnElbV2GeneratedName(this.resource);
  }

  /**
   * Record the properties the load balancer is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}
