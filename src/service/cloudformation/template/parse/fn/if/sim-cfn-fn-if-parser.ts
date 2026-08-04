import { assertDefined } from "../../../../../../util/type-guard/defined.js";
import { SimCfnFnIf as SimCfnFunctionIf } from "../../../node/fn/if/sim-cfn-fn-if.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";

/**
 * Parses CloudFormation Fn::If values.
 */
export class SimCfnFnIfParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::If expression.
   *
   * Both branches are parsed, because a branch that is not valid template
   * syntax is a template mistake whichever way the Condition falls. Only
   * resolving is deferred to the branch the Condition selects.
   */
  parse(value: SimCfnTemplateValue): SimCfnFunctionIf {
    if (!Array.isArray(value) || value.length !== 3) {
      throw new Error(
        "Sim CloudFormation Fn::If value must be [conditionName, valueIfTrue, valueIfFalse]",
      );
    }

    const conditionName = value[0];
    const whenTrue = value[1];
    const whenFalse = value[2];

    assertDefined(whenTrue, "Fn::If value if true");
    assertDefined(whenFalse, "Fn::If value if false");

    if (typeof conditionName !== "string") {
      throw new TypeError(
        "Sim CloudFormation Fn::If condition name must be a string",
      );
    }

    return new SimCfnFunctionIf(
      conditionName,
      this.valueParser.parse(whenTrue),
      this.valueParser.parse(whenFalse),
    );
  }
}
