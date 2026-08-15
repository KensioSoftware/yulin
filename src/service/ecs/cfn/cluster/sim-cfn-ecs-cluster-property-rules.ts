import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The properties a cluster is created with.
 */
const actedOnProperties: ReadonlySet<string> = new Set([
  "ClusterName",
  "ClusterSettings",
  "Configuration",
  "Tags",
]);

/**
 * The real AWS::ECS::Cluster properties this simulation has nothing to act on,
 * and why.
 *
 * `CreateCluster` refuses all three, because there is no capacity and no
 * service discovery here to attach them to. A template carrying one is
 * deployed without it all the same: a stack that will not deploy is worth less
 * to a test than a cluster that holds no capacity it was never going to hold.
 */
const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "CapacityProviders",
    "a simulated task runs in this process rather than on capacity, so there " +
      "is nothing for a capacity provider to place it on",
  ],
  [
    "DefaultCapacityProviderStrategy",
    "there are no capacity providers, so nothing chooses between them",
  ],
  [
    "ServiceConnectDefaults",
    "service discovery is not simulated, so nothing resolves a service by name",
  ],
]);

interface SimCfnEcsClusterPropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a cluster Resource is created without acting on.
 */
export class SimCfnEcsClusterPropertyRules {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnEcsClusterPropertyRulesProperties) {
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
  }

  /**
   * Record every property the cluster is created without.
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
        `${name} is not a property simulated ECS knows about, so the cluster ` +
          `is created without it`,
      );

      return;
    }

    this.ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::ECS::Cluster property simulated ECS does not ` +
        `act on: ${unsimulatedReason}`,
    );
  }
}
