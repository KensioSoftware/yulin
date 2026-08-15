import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCreateTargetGroupCommandInput } from "../../command/target-group/target-group.command.js";
import type { SimElbV2Tag } from "../../command/sim-elbv2-shared.command.js";
import type { SimElbV2TargetDescription } from "../../target-group/sim-elbv2-target.js";
import { simCfnElbV2GeneratedName } from "../name/sim-cfn-elbv2-name.js";
import type { SimCfnElbV2DeclaredResource } from "../property/sim-cfn-elbv2-declared-resource.js";
import { SimCfnElbV2PropertyReader } from "../property/sim-cfn-elbv2-property-reader.js";
import { SimCfnElbV2PropertyRules } from "../property/sim-cfn-elbv2-property-rules.js";
import { simCfnElbV2DeclaredTargets } from "./sim-cfn-elbv2-declared-targets.js";
import {
  simCfnElbV2HealthCheckInput,
  simCfnElbV2HealthCheckProperties,
} from "./sim-cfn-elbv2-health-check-properties.js";

/**
 * The properties a target group is created with.
 */
const actedOnProperties: ReadonlySet<string> = new Set([
  "Name",
  "TargetType",
  "Protocol",
  "ProtocolVersion",
  "Port",
  "VpcId",
  "IpAddressType",
  "Targets",
  "Tags",
  ...simCfnElbV2HealthCheckProperties,
]);

/**
 * The real AWS::ElasticLoadBalancingV2::TargetGroup properties this simulation
 * has nothing to act on, and why.
 */
const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "TargetGroupAttributes",
    "the attributes change how a real load balancer holds connections to a " +
      "target, and a simulated one invokes the target instead",
  ],
]);

/**
 * Reads AWS::ElasticLoadBalancingV2::TargetGroup properties into
 * CreateTargetGroup input.
 */
export class SimCfnElbV2TargetGroupProperties {
  private readonly resource: SimCfnResource;
  private readonly reader: SimCfnElbV2PropertyReader;
  private readonly rules: SimCfnElbV2PropertyRules;

  constructor(declared: SimCfnElbV2DeclaredResource) {
    const { resource, properties } = declared;

    this.resource = resource;
    this.reader = new SimCfnElbV2PropertyReader({ resource, properties });
    this.rules = new SimCfnElbV2PropertyRules({
      resourceTypeName: "TargetGroup",
      described: "target group",
      properties,
      ignorer: resource,
      actedOn: actedOnProperties,
      unsimulated: unsimulatedPropertyReasons,
    });
  }

  /**
   * The CreateTargetGroup input this Resource declares.
   */
  createTargetGroupInput(): SimCreateTargetGroupCommandInput {
    return {
      ...simCfnElbV2HealthCheckInput(this.reader),
      Name: this.name(),
      TargetType: this.reader.text("TargetType"),
      Protocol: this.reader.text("Protocol"),
      ProtocolVersion: this.reader.text("ProtocolVersion"),
      Port: this.reader.number("Port"),
      VpcId: this.reader.text("VpcId"),
      IpAddressType: this.reader.text("IpAddressType"),
      Tags: this.reader.structures<SimElbV2Tag>("Tags"),
    };
  }

  /**
   * The target group name.
   */
  name(): string {
    return this.reader.text("Name") ?? simCfnElbV2GeneratedName(this.resource);
  }

  /**
   * The targets this Resource declares, which are registered once the group
   * exists.
   *
   * Real CloudFormation registers them as part of creating the group, so a
   * stack that declares a Lambda target has a group that routes as soon as it
   * deploys.
   */
  targets(): readonly SimElbV2TargetDescription[] | undefined {
    return simCfnElbV2DeclaredTargets(this.reader);
  }

  /**
   * Record the properties the target group is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}
