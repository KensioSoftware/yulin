import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import {
  SimCfnValueShape,
  type SimCfnValueShapeErrorBuilder,
} from "../value/sim-cfn-value-shape.js";
import type { SimCfnConditionComparison } from "./sim-cfn-condition-comparison.js";

/**
 * Answers a Condition this expression names, by whatever route that takes.
 */
export type SimCfnNamedConditionReader = (conditionName: string) => boolean;

interface SimCfnConditionExpressionProperties {
  readonly label: string;
  readonly error: SimCfnValueShapeErrorBuilder;
  readonly comparison: SimCfnConditionComparison;
  readonly named: SimCfnNamedConditionReader;
}

/**
 * Evaluates the expression tree of one named Condition.
 *
 * The tree is `Fn::Equals` at the leaves and `Fn::And`, `Fn::Or` and `Fn::Not`
 * above them, with `{ "Condition": "OtherCondition" }` handing off to the
 * Condition of that name. Where that other Condition comes from is the
 * evaluator's business, so it arrives as a reader rather than being looked up
 * here.
 *
 * A function name this simulation has no behaviour for is refused rather than
 * read as false, which would deploy a Stack the template did not describe.
 */
export class SimCfnConditionExpression {
  private readonly label: string;
  private readonly error: SimCfnValueShapeErrorBuilder;
  private readonly comparison: SimCfnConditionComparison;
  private readonly named: SimCfnNamedConditionReader;
  private readonly shape: SimCfnValueShape;

  constructor(properties: SimCfnConditionExpressionProperties) {
    this.label = properties.label;
    this.error = properties.error;
    this.comparison = properties.comparison;
    this.named = properties.named;
    this.shape = new SimCfnValueShape(properties.error);
  }

  /**
   * Evaluate one condition function object.
   */
  evaluate(expression: SimCfnTemplateValue): boolean {
    const record = this.shape.record(expression, this.label);
    const entries = Object.entries(record);

    if (entries.length !== 1) {
      throw this.error(
        `${this.label} must be a single condition function object`,
      );
    }

    const entry = entries[0];
    assertDefined(entry, `${this.label} function entry`);

    return this.apply(entry[0], entry[1]);
  }

  private apply(functionName: string, value: SimCfnTemplateValue): boolean {
    if (functionName === "Fn::Equals") {
      return this.comparison.equals(this.label, value);
    }

    if (functionName === "Fn::And") {
      return this.operands(functionName, value).every(Boolean);
    }

    if (functionName === "Fn::Or") {
      return this.operands(functionName, value).includes(true);
    }

    if (functionName === "Fn::Not") {
      return this.negated(value);
    }

    if (functionName === "Condition") {
      return this.named(
        this.shape.string(value, `${this.label} Condition reference`),
      );
    }

    throw this.error(
      `${this.label} uses ${functionName}, which is not a condition function ` +
        "this simulation evaluates",
    );
  }

  private operands(
    functionName: string,
    value: SimCfnTemplateValue,
  ): boolean[] {
    const listed = this.shape.list(value, `${this.label} ${functionName}`);

    if (listed.length < 2) {
      throw this.error(
        `${this.label} ${functionName} must be a list of at least two conditions`,
      );
    }

    return listed.map((operand) => this.evaluate(operand));
  }

  private negated(value: SimCfnTemplateValue): boolean {
    const listed = this.shape.list(value, `${this.label} Fn::Not`);

    if (listed.length !== 1) {
      throw this.error(
        `${this.label} Fn::Not must be a list of exactly one condition`,
      );
    }

    const operand = listed[0];
    assertDefined(operand, `${this.label} Fn::Not condition`);

    return !this.evaluate(operand);
  }
}
