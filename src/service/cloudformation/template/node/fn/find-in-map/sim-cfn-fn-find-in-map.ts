import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { isRecord } from "../../../../../../util/type-guard/record.js";

/**
 * Simulated CloudFormation `Fn::FindInMap` intrinsic function.
 */
export class SimCfnFnFindInMap extends SimCfnNode {
  constructor(
    private readonly mapName: SimCfnNode,
    private readonly topLevelKey: SimCfnNode,
    private readonly secondLevelKey: SimCfnNode,
  ) {
    super();
  }

  /**
   * Resolve a value from the template Mappings section.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const mapName = this.resolveKey(this.mapName, context);
    const topLevelKey = this.resolveKey(this.topLevelKey, context);
    const secondLevelKey = this.resolveKey(this.secondLevelKey, context);

    if (
      !this.isResolvedKey(mapName) ||
      !this.isResolvedKey(topLevelKey) ||
      !this.isResolvedKey(secondLevelKey)
    ) {
      return {
        "Fn::FindInMap": [mapName, topLevelKey, secondLevelKey],
      };
    }

    // eslint-disable-next-line security/detect-object-injection
    const topLevel = context.mappings?.[mapName]?.[topLevelKey];

    /* v8 ignore if -- defensive */
    if (!isRecord(topLevel)) {
      throw new Error(
        `Sim CloudFormation Fn::FindInMap could not find map ${mapName}.${topLevelKey}`,
      );
    }

    // eslint-disable-next-line security/detect-object-injection
    const value = topLevel[secondLevelKey];

    if (value === undefined) {
      throw new Error(
        `Sim CloudFormation Fn::FindInMap could not find map ${mapName}.${topLevelKey}.${secondLevelKey}`,
      );
    }

    return value;
  }

  /**
   * Collect referenced names from every key expression.
   */
  override referencedNames(): string[] {
    /* v8 ignore next */
    return [
      ...this.mapName.referencedNames(),
      ...this.topLevelKey.referencedNames(),
      ...this.secondLevelKey.referencedNames(),
    ];
  }

  private resolveKey(
    node: SimCfnNode,
    context: SimCfnResolveContext,
  ): SimCfnTemplateValue {
    const value = node.resolve(context);

    if (typeof value === "string") {
      return value;
    }

    if (this.isUnresolvedIntrinsicExpression(value)) {
      return value;
    }

    /* v8 ignore next -- defensive */
    throw new TypeError(
      `Sim CloudFormation Fn::FindInMap keys must each resolve to a string, got ${typeof value}`,
    );
  }

  private isUnresolvedIntrinsicExpression(
    value: SimCfnTemplateValue,
  ): value is Record<string, SimCfnTemplateValue> {
    /* v8 ignore if */
    if (!isRecord(value) || Array.isArray(value)) {
      return false;
    }

    const entries = Object.entries(value);

    /* v8 ignore if */
    if (entries.length !== 1) {
      return false;
    }

    const functionName = entries[0]?.[0];

    return functionName === "Ref" || functionName?.startsWith("Fn::") === true;
  }

  private isResolvedKey(value: SimCfnTemplateValue): value is string {
    return typeof value === "string";
  }
}
