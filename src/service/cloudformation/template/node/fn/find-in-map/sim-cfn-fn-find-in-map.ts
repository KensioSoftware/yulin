import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { isRecord } from "../../../../../../util/type-guard/record.js";
import { isSimCfnUnresolvedExpression } from "../../../value/sim-cfn-unresolved-expression.js";

interface SimCfnFnFindInMapProperties {
  readonly mapName: SimCfnNode;
  readonly topLevelKey: SimCfnNode;
  readonly secondLevelKey: SimCfnNode;
  readonly defaultValue?: SimCfnNode | undefined;
}

/**
 * Simulated CloudFormation `Fn::FindInMap` intrinsic function.
 *
 * The fourth argument a template can carry, `{ "DefaultValue": ... }`, answers
 * a lookup the Mappings section has no value for. Without it a missing map or
 * key fails the Resource, because a template that reads a key it never wrote is
 * a mistake worth being told about.
 */
export class SimCfnFnFindInMap extends SimCfnNode {
  private readonly mapName: SimCfnNode;
  private readonly topLevelKey: SimCfnNode;
  private readonly secondLevelKey: SimCfnNode;
  private readonly defaultValue: SimCfnNode | undefined;

  constructor(properties: SimCfnFnFindInMapProperties) {
    super();

    this.mapName = properties.mapName;
    this.topLevelKey = properties.topLevelKey;
    this.secondLevelKey = properties.secondLevelKey;
    this.defaultValue = properties.defaultValue;
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
      return this.unresolved([mapName, topLevelKey, secondLevelKey], context);
    }

    // oxlint-disable-next-line security/detect-object-injection
    const topLevel = context.mappings?.[mapName]?.[topLevelKey];

    if (!isRecord(topLevel)) {
      return this.missing(`${mapName}.${topLevelKey}`, context);
    }

    // oxlint-disable-next-line security/detect-object-injection
    const value = topLevel[secondLevelKey];

    if (value === undefined) {
      return this.missing(
        `${mapName}.${topLevelKey}.${secondLevelKey}`,
        context,
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
      ...(this.defaultValue?.referencedNames() ?? []),
    ];
  }

  /**
   * The `DefaultValue` a lookup falls back to, or a failure naming the path.
   */
  private missing(
    path: string,
    context: SimCfnResolveContext,
  ): SimCfnTemplateValue {
    if (this.defaultValue !== undefined) {
      return this.defaultValue.resolve(context);
    }

    throw new Error(
      `Sim CloudFormation Fn::FindInMap could not find map ${path}`,
    );
  }

  /**
   * The expression left for a later pass, once a key can be a string.
   *
   * The `DefaultValue` goes back with it, so the lookup that eventually reads
   * the Mappings still has the answer for a key that is not there.
   */
  private unresolved(
    keys: readonly SimCfnTemplateValue[],
    context: SimCfnResolveContext,
  ): SimCfnTemplateValue {
    if (this.defaultValue === undefined) {
      return { "Fn::FindInMap": [...keys] };
    }

    return {
      "Fn::FindInMap": [
        ...keys,
        { DefaultValue: this.defaultValue.resolve(context) },
      ],
    };
  }

  private resolveKey(
    node: SimCfnNode,
    context: SimCfnResolveContext,
  ): SimCfnTemplateValue {
    const value = node.resolve(context);

    if (typeof value === "string") {
      return value;
    }

    if (isSimCfnUnresolvedExpression(value)) {
      return value;
    }

    /* v8 ignore next -- defensive */
    throw new TypeError(
      `Sim CloudFormation Fn::FindInMap keys must each resolve to a string, got ${typeof value}`,
    );
  }

  private isResolvedKey(value: SimCfnTemplateValue): value is string {
    return typeof value === "string";
  }
}
