import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnNode } from "../node/sim-cfn-node.js";
import { SimCfnList } from "../node/sim-cfn-list.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { SimCfnLiteral } from "../node/sim-cfn-literal.js";
import { SimCfnObject } from "../node/sim-cfn-object.js";
import { SimCfnRef } from "../node/sim-cfn-ref.js";
import { SimCfnFnJoin } from "../node/fn/join/sim-cfn-fn-join.js";

/**
 * Parse raw CloudFormation template values into concrete node trees.
 *
 * This is the single boundary between loosely-typed template JSON and the
 * strongly-typed node classes the rest of the simulator works with.
 */
export class SimCfnNodeParser {
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

    const fn = this.parseFunction(value);
    if (fn !== undefined) {
      return fn;
    }

    const entries = new Map<string, SimCfnNode>();
    for (const [key, entryValue] of Object.entries(value)) {
      entries.set(key, this.parse(entryValue));
    }

    return new SimCfnObject(entries);
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

  private parseFunction(
    value: Record<string, SimCfnTemplateValue>,
  ): SimCfnNode | undefined {
    const entries = Object.entries(value);

    if (entries.length !== 1) {
      return undefined;
    }

    const [functionName, functionValue] = this.requiredSingleEntry(entries);

    if (!functionName.startsWith("Fn::")) {
      return undefined;
    }

    if (functionName === "Fn::Join") {
      return this.parseFnJoin(functionValue);
    }

    throw new Error(
      `Unsupported Sim CloudFormation intrinsic function ${functionName}`,
    );
  }

  private requiredSingleEntry(
    entries: readonly (readonly [string, SimCfnTemplateValue])[],
  ): readonly [string, SimCfnTemplateValue] {
    const entry = entries[0];

    if (entry === undefined) {
      throw new Error("Expected exactly one Sim CloudFormation template entry");
    }

    return entry;
  }

  private parseFnJoin(value: SimCfnTemplateValue): SimCfnFnJoin {
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
      values.map((item) => this.parse(item)),
    );
  }
}

/**
 * Parse a raw CloudFormation template value into a concrete node tree.
 */
export function parseSimCfnNode(value: SimCfnTemplateValue): SimCfnNode {
  return new SimCfnNodeParser().parse(value);
}
