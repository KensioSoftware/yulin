import { assertDefined } from "../../../../util/type-guard/defined.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnTemplateValueResolver } from "../value/sim-cfn-template-value-resolver.js";
import {
  SimCfnValueShape,
  type SimCfnValueShapeErrorBuilder,
} from "../value/sim-cfn-value-shape.js";

interface SimCfnConditionComparisonProperties {
  readonly valueResolver: SimCfnTemplateValueResolver;
  readonly error: SimCfnValueShapeErrorBuilder;
}

/**
 * Answers the `Fn::Equals` a Condition is built from.
 *
 * Both sides are resolved from Parameters and pseudo parameters, then compared
 * as the strings CloudFormation compares, so a JSON number in the template
 * matches the string a Parameter carries.
 */
export class SimCfnConditionComparison {
  private readonly valueResolver: SimCfnTemplateValueResolver;
  private readonly error: SimCfnValueShapeErrorBuilder;
  private readonly shape: SimCfnValueShape;

  constructor(properties: SimCfnConditionComparisonProperties) {
    this.valueResolver = properties.valueResolver;
    this.error = properties.error;
    this.shape = new SimCfnValueShape(properties.error);
  }

  /**
   * Whether the two values an Fn::Equals carries are the same.
   */
  equals(label: string, value: SimCfnTemplateValue): boolean {
    const operands = this.shape.list(value, `${label} Fn::Equals`);

    if (operands.length !== 2) {
      throw this.error(
        `${label} Fn::Equals must be a list of exactly two values`,
      );
    }

    const left = operands[0];
    const right = operands[1];
    assertDefined(left, `${label} Fn::Equals left value`);
    assertDefined(right, `${label} Fn::Equals right value`);

    return this.comparable(label, left) === this.comparable(label, right);
  }

  private comparable(label: string, value: SimCfnTemplateValue): string {
    const resolved = this.valueResolver.resolve(value);

    if (isRecord(resolved) || Array.isArray(resolved)) {
      throw this.error(
        `${label} Fn::Equals cannot compare ${jsonStringify(resolved)}, ` +
          "which does not resolve from Parameters alone",
      );
    }

    return String(resolved);
  }
}
