import { parseSimCfnResourceDependencies } from "../../resource/dependency/sim-cfn-resource-dependencies.js";
import { isCfnTemplateValueRecord } from "../../resource/template/sim-cfn-templ-value-record.js";
import { parseSimCfnNode } from "../parse/node/sim-cfn-node-parser.js";
import type { SimCfnResourceTemplateRecord } from "../sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnConditions } from "./sim-cfn-conditions.js";

interface SimCfnResourceConditionsProperties {
  readonly resources: Record<string, SimCfnTemplateValue>;
  readonly conditions: SimCfnConditions;
  readonly stackName?: string | undefined;
}

/**
 * Applies the Resource-level `Condition` attribute to a template's Resources.
 *
 * A Resource whose Condition is false is not created at all, so it never
 * reaches the Stack Resource map. That is deliberately not the skipped-Resource
 * path used for a Resource type this simulation cannot create: a skipped
 * Resource is still in the Stack and still answers `Ref` and `Fn::GetAtt` with
 * stand-in values, where a Resource the template conditioned out does not
 * exist, and naming it is a template mistake CloudFormation refuses.
 */
export class SimCfnResourceConditions {
  private readonly stackName: string | undefined;
  private readonly conditionedOut: ReadonlyMap<string, string>;

  constructor(properties: SimCfnResourceConditionsProperties) {
    this.stackName = properties.stackName;
    this.conditionedOut = this.readConditionedOut(
      properties.resources,
      properties.conditions,
    );
  }

  /**
   * Whether the template asked for this Resource but its Condition is false.
   */
  excludes(logicalId: string): boolean {
    return this.conditionedOut.has(logicalId);
  }

  /**
   * Refuse a template where a Resource that is created names one that is not.
   *
   * Both the intrinsic expressions and `DependsOn` count. A `DependsOn` on a
   * Resource the Stack never creates would otherwise leave the deployment
   * waiting on it and fail as an unresolvable dependency, which says nothing
   * about the Condition that caused it.
   *
   * The templates given here are already resolved, so an `Fn::If` has picked
   * its branch: a name only the branch that was not taken carries never gets
   * this far.
   */
  assertNotReferenced(
    resourceTemplates: readonly SimCfnResourceTemplateRecord[],
  ): void {
    if (this.conditionedOut.size === 0) {
      return;
    }

    for (const { logicalId, template } of resourceTemplates) {
      this.assertNamesOnlyCreated(
        logicalId,
        new Set([
          ...parseSimCfnNode(template).referencedNames(),
          ...parseSimCfnResourceDependencies(template["DependsOn"]),
        ]),
      );
    }
  }

  private assertNamesOnlyCreated(
    logicalId: string,
    referenced: ReadonlySet<string>,
  ): void {
    for (const [excludedId, conditionName] of this.conditionedOut) {
      if (!referenced.has(excludedId)) {
        continue;
      }

      throw this.error(
        `Resource ${logicalId} names Resource ${excludedId}, which the ` +
          `Stack does not create because its Condition ${conditionName} ` +
          "is false",
      );
    }
  }

  private readConditionedOut(
    resources: Record<string, SimCfnTemplateValue>,
    conditions: SimCfnConditions,
  ): ReadonlyMap<string, string> {
    const conditionedOut = new Map<string, string>();

    for (const [logicalId, resourceTemplate] of Object.entries(resources)) {
      const conditionName = this.conditionName(logicalId, resourceTemplate);

      if (conditionName === undefined) {
        continue;
      }

      if (!conditions.has(conditionName)) {
        throw this.error(
          `Resource ${logicalId} names Condition ${conditionName}, which the ` +
            "template does not define",
        );
      }

      if (!conditions.value(conditionName)) {
        conditionedOut.set(logicalId, conditionName);
      }
    }

    return conditionedOut;
  }

  private conditionName(
    logicalId: string,
    resourceTemplate: SimCfnTemplateValue,
  ): string | undefined {
    if (!isCfnTemplateValueRecord(resourceTemplate)) {
      return undefined;
    }

    const conditionName = resourceTemplate["Condition"];

    if (conditionName === undefined) {
      return undefined;
    }

    if (typeof conditionName !== "string") {
      throw this.error(`Resource ${logicalId} Condition must be a string`);
    }

    return conditionName;
  }

  private error(detail: string): Error {
    return new Error(
      `Sim CloudFormation Stack ${this.stackName ?? "unknown"} ${detail}`,
    );
  }
}
