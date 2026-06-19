import { SimCfnNode, type SimCfnResolveContext } from "../../sim-cfn-node.js";

/**
 * Simulated CloudFormation `Fn::Join` intrinsic function.
 *
 * Standard shape:
 *
 * {
 *   "Fn::Join": ["-", ["a", "b", { "Ref": "Name" }]]
 * }
 */
export class SimCfnFnJoin extends SimCfnNode {
  constructor(
    private readonly delimiter: string,
    private readonly values: readonly SimCfnNode[],
  ) {
    super();
  }

  /**
   * Resolve each value to a string and join them with the delimiter.
   */
  resolve(context: SimCfnResolveContext): string {
    return this.values
      .map((value) => this.resolveStringValue(value, context))
      .join(this.delimiter);
  }

  private resolveStringValue(
    value: SimCfnNode,
    context: SimCfnResolveContext,
  ): string {
    const resolved = value.resolve(context);

    if (typeof resolved !== "string") {
      throw new TypeError(
        `Sim CloudFormation Fn::Join values must each resolve to a string, got ${typeof resolved}`,
      );
    }

    return resolved;
  }
}
