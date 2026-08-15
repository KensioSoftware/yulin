import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The properties a revision is registered with.
 *
 * Everything a registration holds is here, because a task definition is a
 * declaration and a described revision reports it back. What a running task
 * actually acts on is a much shorter list, and that difference belongs in the
 * usage docs rather than in a property being dropped.
 */
const actedOnProperties: ReadonlySet<string> = new Set([
  "Family",
  "ContainerDefinitions",
  "TaskRoleArn",
  "ExecutionRoleArn",
  "NetworkMode",
  "Cpu",
  "Memory",
  "RequiresCompatibilities",
  "Volumes",
  "PlacementConstraints",
  "RuntimePlatform",
  "EphemeralStorage",
  "ProxyConfiguration",
  "PidMode",
  "IpcMode",
  "Tags",
]);

/**
 * The real AWS::ECS::TaskDefinition properties this simulation has nothing to
 * act on, and why.
 *
 * `RegisterTaskDefinition` refuses both, since a setting it does not hold
 * would go missing from the revision it made. A template carrying one is
 * deployed without it rather than failing the stack, because the rest of the
 * task definition is still worth having.
 */
const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "InferenceAccelerators",
    "there is no device to attach, since a container is an in-process handler",
  ],
  [
    "EnableFaultInjection",
    "nothing injects a fault into a simulated task, and no traffic passes " +
      "through anything that could",
  ],
]);

interface SimCfnEcsTaskDefinitionPropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a task definition Resource is registered without acting on.
 */
export class SimCfnEcsTaskDefinitionPropertyRules {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnEcsTaskDefinitionPropertyRulesProperties) {
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
  }

  /**
   * Record every property the revision is registered without.
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

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason === undefined) {
      this.ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated ECS knows about, so the task ` +
          `definition is registered without it`,
      );

      return;
    }

    this.ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::ECS::TaskDefinition property simulated ECS ` +
        `does not act on: ${unsimulatedReason}`,
    );
  }
}
