import { SimCfnFnJoin as SimCfnFunctionJoin } from "../../../node/fn/join/sim-cfn-fn-join.js";
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
 * The values argument goes through the recursive value parser. It may be a
 * literal list, whose entries may themselves be literals, Refs or other
 * intrinsic functions, or a function that returns a whole list (such as
 * `Fn::GetAtt` on a hosted zone's `NameServers`, or `Fn::Split`). Whether it
 * resolves to a list of strings is a resolution-time question, so it belongs
 * to the node. A string, number or boolean in its place can never become a
 * list, and is refused here.
 */
export class SimCfnFnJoinParser {
  constructor(private readonly valueParser: SimCfnValueParser) {}

  /**
   * Parse and validate the value inside a Fn::Join expression.
   */
  parse(value: SimCfnTemplateValue): SimCfnFunctionJoin {
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

    if (typeof values !== "object" || values === null) {
      throw new TypeError(
        "Sim CloudFormation Fn::Join values must be a list or a function " +
          "that returns one",
      );
    }

    return new SimCfnFunctionJoin(delimiter, this.valueParser.parse(values));
  }
}
