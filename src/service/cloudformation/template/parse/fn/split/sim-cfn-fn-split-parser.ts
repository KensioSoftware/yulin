import { SimCfnFnSplit as SimCfnFunctionSplit } from "../../../node/fn/split/sim-cfn-fn-split.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";
import { assertDefined } from "../../../../../../util/type-guard/defined.js";

/**
 * Parses CloudFormation Fn::Split values.
 *
 * Fn::Split has the shape:
 *
 * {
 *   "Fn::Split": ["/", { "Fn::GetAtt": ["Url", "FunctionUrl"] }]
 * }
 *
 * The delimiter is a literal string, as CloudFormation requires. The source
 * string goes through the recursive value parser, because it may be a literal,
 * a Ref, or another intrinsic function.
 */
export class SimCfnFnSplitParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::Split expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnFunctionSplit {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(
        "Sim CloudFormation Fn::Split value must be [delimiter, sourceString]",
      );
    }

    const [delimiter, source] = value;

    if (typeof delimiter !== "string") {
      throw new TypeError(
        "Sim CloudFormation Fn::Split delimiter must be a string",
      );
    }

    assertDefined(source, "Fn::Split source string");

    return new SimCfnFunctionSplit(delimiter, this.valueParser.parse(source));
  }
}
