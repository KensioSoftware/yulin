import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

/**
 * The Conditions section of a CloudFormation template body.
 *
 * Each entry is a condition function expression, which is only evaluated once
 * the Stack's Parameter values are known.
 */
export type SimCfnConditionsSection = Record<string, SimCfnTemplateValue>;

/**
 * A template's Conditions section, already evaluated to booleans.
 *
 * A Condition can only read Parameters and pseudo parameters, so the whole
 * section is evaluated once per deployment, before any Resource is created.
 * Everything downstream reads these answers rather than the expressions.
 */
export class SimCfnConditions {
  private readonly values: ReadonlyMap<string, boolean>;

  constructor(values: ReadonlyMap<string, boolean> = new Map()) {
    this.values = values;
  }

  /**
   * Whether the template defines a Condition with this name.
   */
  has(conditionName: string): boolean {
    return this.values.has(conditionName);
  }

  /**
   * The evaluated value of a Condition the template defines.
   */
  value(conditionName: string): boolean {
    const value = this.values.get(conditionName);
    assertDefined(
      value,
      `Sim CloudFormation Condition ${conditionName} is not defined in the template Conditions`,
    );

    return value;
  }
}
