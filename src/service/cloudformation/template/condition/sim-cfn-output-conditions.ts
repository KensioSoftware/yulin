import type { SimCfnTemplateValueRecord } from "../value/sim-cfn-template-value.js";
import type { SimCfnConditions } from "./sim-cfn-conditions.js";

interface SimCfnOutputConditionsProperties {
  readonly conditions: SimCfnConditions;
  readonly stackName?: string | undefined;
}

/**
 * Applies the Output-level `Condition` attribute to a template's Outputs.
 *
 * An Output whose Condition is false is left out of the Stack altogether. It is
 * never resolved, so it is absent from `stack.outputs` and from `DescribeStacks`,
 * and the export name it carries is never published for another Stack to import.
 *
 * Naming a Condition the template does not define fails the deployment, the way
 * it does on a Resource. An Output that quietly disappeared because its
 * Condition was misspelled is worse than a Stack that refuses to deploy.
 */
export class SimCfnOutputConditions {
  private readonly conditions: SimCfnConditions;
  private readonly stackName: string | undefined;

  constructor(properties: SimCfnOutputConditionsProperties) {
    this.conditions = properties.conditions;
    this.stackName = properties.stackName;
  }

  /**
   * Whether the template asked for this Output but its Condition is false.
   */
  excludes(
    outputKey: string,
    outputTemplate: SimCfnTemplateValueRecord,
  ): boolean {
    const conditionName = outputTemplate["Condition"];

    if (conditionName === undefined) {
      return false;
    }

    if (typeof conditionName !== "string") {
      throw this.error(`Output ${outputKey} Condition must be a string`);
    }

    if (!this.conditions.has(conditionName)) {
      throw this.error(
        `Output ${outputKey} names Condition ${conditionName}, which the ` +
          "template does not define",
      );
    }

    return !this.conditions.value(conditionName);
  }

  private error(detail: string): Error {
    return new Error(
      `Sim CloudFormation Stack ${this.stackName ?? "unknown"} ${detail}`,
    );
  }
}
