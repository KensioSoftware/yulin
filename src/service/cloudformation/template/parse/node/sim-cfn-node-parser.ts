import type { SimCfnTemplateValue } from "../../value/sim-cfn-template-value.js";
import type { SimCfnNode } from "../../node/sim-cfn-node.js";
import { SimCfnList } from "../../node/sim-cfn-list.js";
import { isRecord } from "../../../../../util/type-guard/record.js";
import { SimCfnLiteral } from "../../node/sim-cfn-literal.js";
import { SimCfnObject } from "../../node/sim-cfn-object.js";
import { SimCfnRef } from "../../node/sim-cfn-ref.js";
import { SimCfnFunctionParser } from "../fn/sim-cfn-function-parser.js";

/**
 * Parse raw CloudFormation template values into concrete node trees.
 *
 * This is the single boundary between loosely-typed template JSON and the
 * strongly-typed node classes the rest of the simulator works with.
 *
 * This parser owns generic recursive tree parsing:
 * - arrays become SimCfnList;
 * - primitives become SimCfnLiteral;
 * - plain objects become SimCfnObject;
 * - intrinsic expressions are delegated to smaller parsers.
 *
 * The function parser receives this parser instance through the SimCfnValueParser
 * interface so function-specific parsers can recursively parse child values
 * without importing this class directly.
 */
export class SimCfnNodeParser {
  private readonly functionParser: SimCfnFunctionParser;

  constructor() {
    this.functionParser = new SimCfnFunctionParser(this);
  }

  /**
   * Parse a raw CloudFormation template value into a concrete node tree.
   */
  parse(value: SimCfnTemplateValue): SimCfnNode {
    if (Array.isArray(value)) {
      return new SimCfnList(value.map((item) => this.parse(item)));
    }

    if (!isRecord(value)) {
      return new SimCfnLiteral(value);
    }

    const ref = this.parseRef(value);
    if (ref !== undefined) {
      return ref;
    }

    const fn = this.functionParser.parse(value);
    if (fn !== undefined) {
      return fn;
    }

    return this.parseObject(value);
  }

  private parseRef(
    value: Record<string, SimCfnTemplateValue>,
  ): SimCfnRef | undefined {
    if (Object.keys(value).length !== 1 || !("Ref" in value)) {
      return undefined;
    }

    const name = value["Ref"];

    if (typeof name !== "string") {
      return undefined;
    }

    return new SimCfnRef(name);
  }

  private parseObject(
    value: Record<string, SimCfnTemplateValue>,
  ): SimCfnObject {
    const entries = new Map<string, SimCfnNode>();

    for (const [key, entryValue] of Object.entries(value)) {
      entries.set(key, this.parse(entryValue));
    }

    return new SimCfnObject(entries);
  }
}

/**
 * Parse a raw CloudFormation template value into a concrete node tree.
 */
export function parseSimCfnNode(value: SimCfnTemplateValue): SimCfnNode {
  return new SimCfnNodeParser().parse(value);
}
