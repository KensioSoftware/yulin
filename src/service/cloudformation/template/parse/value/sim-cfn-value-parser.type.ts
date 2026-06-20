import type { SimCfnNode } from "../../node/sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../value/sim-cfn-template-value.js";

/**
 * Minimal recursive parser contract used by intrinsic-function parsers.
 *
 * SimCfnNodeParser owns the full template-tree parse. Function-specific parsers
 * sometimes need to parse child values using that same recursive behavior; for
 * example Fn::Join parses each joined value as a full CloudFormation node.
 *
 * This interface lets those parsers depend on "something that can parse a
 * template value" instead of importing SimCfnNodeParser directly. That keeps the
 * dependency direction one-way:
 *
 * SimCfnNodeParser -> SimCfnFunctionParser -> function-specific parsers
 *
 * without a concrete parser import cycle back into SimCfnNodeParser.
 */
export interface SimCfnValueParser {
  parse(value: SimCfnTemplateValue): SimCfnNode;
}
