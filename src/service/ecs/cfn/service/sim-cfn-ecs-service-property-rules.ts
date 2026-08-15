import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnEcsServiceUnsimulatedReasons } from "./sim-cfn-ecs-service-unsimulated-properties.js";

/**
 * The properties a service is created with.
 *
 * `LoadBalancers` is here because the declaration is held on the service, not
 * because anything routes to it yet: a target group has to be able to read
 * which service and container answer for it before it can send one a request.
 */
const actedOnProperties: ReadonlySet<string> = new Set([
  "Cluster",
  "ServiceName",
  "TaskDefinition",
  "DesiredCount",
  "LaunchType",
  "SchedulingStrategy",
  "LoadBalancers",
]);

interface SimCfnEcsServicePropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a service Resource is created without acting on.
 */
export class SimCfnEcsServicePropertyRules {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnEcsServicePropertyRulesProperties) {
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
  }

  /**
   * Record every property the service is created without.
   */
  apply(): void {
    for (const name of Object.keys(this.properties)) {
      this.applyToProperty(name);
    }
  }

  private applyToProperty(name: string): void {
    if (actedOnProperties.has(name)) {
      return;
    }

    const unsimulatedReason = simCfnEcsServiceUnsimulatedReasons.get(name);

    if (unsimulatedReason === undefined) {
      this.ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated ECS knows about, so the service ` +
          `is created without it`,
      );

      return;
    }

    this.ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::ECS::Service property simulated ECS does not ` +
        `act on: ${unsimulatedReason}`,
    );
  }
}
