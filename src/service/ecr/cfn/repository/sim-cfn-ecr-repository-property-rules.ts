import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { unsimulatedPropertyReasons } from "./sim-cfn-ecr-repository-unsimulated-properties.js";

interface SimCfnEcrRepositoryPropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a repository Resource is created without acting on.
 *
 * RepositoryName is the only property this simulation reads. Everything else,
 * whether ECR has it or not, is recorded so a reader can see what a deployed
 * repository is not doing.
 */
export class SimCfnEcrRepositoryPropertyRules {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnEcrRepositoryPropertyRulesProperties) {
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
  }

  /**
   * Record every property the repository is created without.
   */
  apply(): void {
    for (const name of Object.keys(this.properties)) {
      this.applyToProperty(name);
    }
  }

  private applyToProperty(name: string): void {
    if (name === "RepositoryName") {
      return;
    }

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason === undefined) {
      this.ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated ECR knows about, so the ` +
          `repository is created without it`,
      );

      return;
    }

    this.ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::ECR::Repository property simulated ECR does ` +
        `not act on: ${unsimulatedReason}`,
    );
  }
}
