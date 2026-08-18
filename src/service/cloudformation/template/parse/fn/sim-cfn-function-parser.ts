import type { SimCfnNode } from "../../node/sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../value/sim-cfn-template-value.js";
import type { SimCfnValueParser } from "../value/sim-cfn-value-parser.type.js";
import {
  makeSimCfnFunctionParsers,
  type SimCfnFunctionValueParser,
} from "./sim-cfn-function-parsers.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";

/**
 * Parses CloudFormation intrinsic function objects.
 *
 * This parser handles the common object-level rules for intrinsic functions:
 *
 * - an intrinsic function object must have exactly one key;
 * - supported long-form functions use the Fn::* namespace;
 * - an object with a non-intrinsic first key but an Fn::* sibling is malformed;
 * - function-specific value validation belongs to function-specific parsers.
 *
 * Which functions are supported, and what parses each one, is the table in
 * sim-cfn-function-parsers.ts.
 *
 * It does not parse arbitrary template values. SimCfnNodeParser owns the full
 * recursive tree parse and passes itself in as SimCfnValueParser for functions
 * that need child values parsed recursively.
 */
export class SimCfnFunctionParser {
  private readonly functionParsers: ReadonlyMap<
    string,
    SimCfnFunctionValueParser
  >;

  constructor(valueParser: SimCfnValueParser) {
    this.functionParsers = makeSimCfnFunctionParsers(valueParser);
  }

  /**
   * Parse a CloudFormation intrinsic function object, if this object is one.
   *
   * Returns undefined for ordinary objects so the caller can parse them as
   * SimCfnObject. Throws for malformed or unsupported intrinsic function objects
   * because those should not silently degrade into plain object values.
   */
  parse(value: Record<string, SimCfnTemplateValue>): SimCfnNode | undefined {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return undefined;
    }

    const [functionName, functionValue] = this.requiredFirstEntry(entries);

    if (!this.isIntrinsicFunctionName(functionName)) {
      this.assertNoMalformedIntrinsicSibling(entries);

      return undefined;
    }

    this.assertSingleIntrinsicEntry(entries, functionName);

    return this.parseSupportedFunction(functionName, functionValue);
  }

  private parseSupportedFunction(
    functionName: string,
    value: SimCfnTemplateValue,
  ): SimCfnNode {
    const functionParser = this.functionParsers.get(functionName);

    if (functionParser !== undefined) {
      return functionParser.parse(value);
    }

    throw new Error(
      `Unsupported Sim CloudFormation intrinsic function ${functionName}`,
    );
  }

  private assertNoMalformedIntrinsicSibling(
    entries: readonly (readonly [string, SimCfnTemplateValue])[],
  ): void {
    const intrinsicEntry = entries.find(([key]) =>
      this.isIntrinsicFunctionName(key),
    );

    if (intrinsicEntry !== undefined) {
      throw new Error(
        `Malformed Sim CloudFormation intrinsic function object ${intrinsicEntry[0]}`,
      );
    }
  }

  private assertSingleIntrinsicEntry(
    entries: readonly (readonly [string, SimCfnTemplateValue])[],
    functionName: string,
  ): void {
    if (entries.length !== 1) {
      throw new Error(
        `Malformed Sim CloudFormation intrinsic function object ${functionName}`,
      );
    }
  }

  private requiredFirstEntry(
    entries: readonly (readonly [string, SimCfnTemplateValue])[],
  ): readonly [string, SimCfnTemplateValue] {
    const entry = entries[0];
    assertDefined(
      entry,
      "Expected one Sim CloudFormation template entry, got none",
    );

    return entry;
  }

  private isIntrinsicFunctionName(name: string): boolean {
    return name.startsWith("Fn::");
  }
}
