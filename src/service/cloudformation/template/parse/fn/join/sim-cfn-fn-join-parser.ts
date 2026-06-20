import { SimCfnFnJoin } from "../../../node/fn/join/sim-cfn-fn-join.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../../value/sim-cfn-value-parser.type.js";

/**
 * Parses CloudFormation Fn::Join values.
 *
 * Fn::Join has the shape:
 *
 * {
 *   "Fn::Join": ["-", ["a", { "Ref": "Name" }]]
 * }
 *
 * The parser validates only the Fn::Join envelope: a string delimiter and an
 * array of values. Each joined value is parsed through the recursive value
 * parser, because join entries may themselves be literals, Refs, other
 * intrinsic functions, arrays, or plain objects.
 */
export class SimCfnFnJoinParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::Join expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnFnJoin {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(
        "Sim CloudFormation Fn::Join value must be [delimiter, values]",
      );
    }

    const [delimiter, values] = value;

    if (typeof delimiter !== "string") {
      throw new TypeError(
        "Sim CloudFormation Fn::Join delimiter must be a string",
      );
    }

    if (!Array.isArray(values)) {
      throw new TypeError(
        "Sim CloudFormation Fn::Join values must be an array",
      );
    }

    return new SimCfnFnJoin(
      delimiter,
      values.map((item) => this.valueParser.parse(item)),
    );
  }
}
