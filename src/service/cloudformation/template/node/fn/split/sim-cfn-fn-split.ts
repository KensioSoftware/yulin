import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { isSimCfnUnresolvedExpression } from "../../../value/sim-cfn-unresolved-expression.js";
import { hasSimCfnDynamicReference } from "../../../dynamic/sim-cfn-dynamic-reference-scan.js";

/**
 * Simulated CloudFormation `Fn::Split` intrinsic function.
 *
 * Standard shape:
 *
 * {
 *   "Fn::Split": ["/", { "Fn::GetAtt": ["Url", "FunctionUrl"] }]
 * }
 */
export class SimCfnFnSplit extends SimCfnNode {
  constructor(
    private readonly delimiter: string,
    private readonly source: SimCfnNode,
  ) {
    super();
  }

  /**
   * Split the resolved source string on the delimiter.
   *
   * Splitting happens only once the source has resolved to a string. A source
   * that is still an unresolved expression, such as an `Fn::GetAtt` read
   * before Resources exist, re-emits this function in template form for a
   * later resolution pass to finish.
   *
   * A string still holding a dynamic reference is deferred the same way, on
   * the pass that has no service to read one with. The delimiters are inside
   * the value that service has yet to answer with, which is the whole point of
   * splitting a `StringList` parameter, so splitting now would cut up the
   * reference. A reference left after the reading pass belongs to a service
   * with no resolver, and is split as the plain text it stayed.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const source = this.source.resolve(context);

    if (typeof source === "string") {
      if (
        context.dynamicReferences === undefined &&
        hasSimCfnDynamicReference(source)
      ) {
        return { "Fn::Split": [this.delimiter, source] };
      }

      return source.split(this.delimiter);
    }

    if (isSimCfnUnresolvedExpression(source)) {
      return { "Fn::Split": [this.delimiter, source] };
    }

    throw new TypeError(
      `Sim CloudFormation Fn::Split source must resolve to a string, got ${typeof source}`,
    );
  }

  /**
   * Collect referenced names from the source expression.
   */
  override referencedNames(): string[] {
    return this.source.referencedNames();
  }
}
