import { isRecord } from "../../../../../../util/type-guard/record.js";
import { SimCfnFnSub } from "../../../node/fn/sub/sim-cfn-fn-sub.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";

/**
 * Parses CloudFormation Fn::Sub values.
 *
 * Fn::Sub has either shape:
 *
 * {
 *   "Fn::Sub": "prefix-${Name}"
 * }
 *
 * or:
 *
 * {
 *   "Fn::Sub": ["prefix-${Name}", { "Name": { "Ref": "SomeName" } }]
 * }
 */
export class SimCfnFnSubParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::Sub expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnFnSub {
    if (typeof value === "string") {
      return new SimCfnFnSub(value);
    }

    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(
        "Sim CloudFormation Fn::Sub value must be a string or [string, variables]",
      );
    }

    const [template, variables] = value;

    if (typeof template !== "string") {
      throw new TypeError(
        "Sim CloudFormation Fn::Sub template must be a string",
      );
    }

    if (!isRecord(variables)) {
      throw new TypeError(
        "Sim CloudFormation Fn::Sub variables must be an object",
      );
    }

    return new SimCfnFnSub(
      template,
      new Map(
        Object.entries(variables).map(([name, variableValue]) => [
          name,
          this.valueParser.parse(variableValue),
        ]),
      ),
    );
  }
}
