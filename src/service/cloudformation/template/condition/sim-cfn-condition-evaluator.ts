import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnTemplateValueResolver } from "../value/sim-cfn-template-value-resolver.js";
import { SimCfnConditionComparison } from "./sim-cfn-condition-comparison.js";
import { SimCfnConditionExpression } from "./sim-cfn-condition-expression.js";
import {
  SimCfnConditions,
  type SimCfnConditionsSection,
} from "./sim-cfn-conditions.js";

interface SimCfnConditionEvaluatorProperties {
  readonly conditions?: SimCfnConditionsSection | undefined;
  readonly valueResolver: SimCfnTemplateValueResolver;
  readonly stackName?: string | undefined;
}

/**
 * Evaluates a template's Conditions section into plain booleans.
 *
 * The section is not written in dependency order, so each name is evaluated on
 * demand and remembered, with the chain of names being evaluated carried along
 * to catch a Condition that refers back to itself.
 *
 * Every leaf comes from the Parameters and pseudo parameters the Stack was
 * given, so the answers are the same however often they are read. A comparison
 * that would need a created Resource fails the deployment instead of quietly
 * answering false, because a Condition that reads false when it should read
 * true silently deploys the wrong Stack.
 */
export class SimCfnConditionEvaluator {
  private readonly expressions: ReadonlyMap<string, SimCfnTemplateValue>;
  private readonly stackName: string | undefined;
  private readonly comparison: SimCfnConditionComparison;
  private readonly values = new Map<string, boolean>();

  constructor(properties: SimCfnConditionEvaluatorProperties) {
    this.expressions = new Map(Object.entries(properties.conditions ?? {}));
    this.stackName = properties.stackName;
    this.comparison = new SimCfnConditionComparison({
      valueResolver: properties.valueResolver,
      error: (reason): Error => this.error(reason),
    });
  }

  /**
   * Evaluate every Condition the template defines.
   */
  evaluate(): SimCfnConditions {
    for (const conditionName of this.expressions.keys()) {
      this.evaluateNamed(conditionName, []);
    }

    return new SimCfnConditions(this.values);
  }

  private evaluateNamed(
    conditionName: string,
    resolving: readonly string[],
  ): boolean {
    const known = this.values.get(conditionName);

    if (known !== undefined) {
      return known;
    }

    const chain = [...resolving, conditionName];

    if (resolving.includes(conditionName)) {
      const route = chain.join(" -> ");

      throw this.error(
        `Condition ${conditionName} refers to itself through ${route}`,
      );
    }

    const expression = this.expressions.get(conditionName);
    assertDefined(
      expression,
      this.message(
        `Condition ${conditionName} is not defined in the template Conditions`,
      ),
    );

    const value = new SimCfnConditionExpression({
      label: `Condition ${conditionName}`,
      error: (reason): Error => this.error(reason),
      comparison: this.comparison,
      named: (name): boolean => this.evaluateNamed(name, chain),
    }).evaluate(expression);

    this.values.set(conditionName, value);

    return value;
  }

  private error(detail: string): Error {
    return new Error(this.message(detail));
  }

  private message(detail: string): string {
    return `Sim CloudFormation Stack ${this.stackName ?? "unknown"} ${detail}`;
  }
}
