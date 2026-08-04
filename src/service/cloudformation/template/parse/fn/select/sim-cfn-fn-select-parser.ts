import { SimCfnFnSelect as SimCfnFunctionSelect } from "../../../node/fn/select/sim-cfn-fn-select.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";
import { assertDefined } from "../../../../../../util/type-guard/defined.js";

/**
 * Parses CloudFormation Fn::Select values.
 *
 * Fn::Select has the shape:
 *
 * {
 *   "Fn::Select": [2, { "Fn::Split": ["/", "https://example.com/path"] }]
 * }
 *
 * Both arguments go through the recursive value parser. The index may be a Ref
 * to a Parameter, and the list may be a literal list or another intrinsic
 * function that yields one. Whether they resolve to a whole number and a list
 * is a resolution-time question, so it belongs to the node rather than here.
 */
export class SimCfnFnSelectParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::Select expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnFunctionSelect {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(
        "Sim CloudFormation Fn::Select value must be [index, values]",
      );
    }

    const [index, values] = value;

    assertDefined(index, "Fn::Select index");
    assertDefined(values, "Fn::Select values");

    return new SimCfnFunctionSelect(
      this.valueParser.parse(index),
      this.valueParser.parse(values),
    );
  }
}
