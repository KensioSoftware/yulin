import { SimCfnNode } from "./sim-cfn-node.js";
import type { SimCfnTemplatePrimitiveValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnResolveContext } from "../resolve/sim-cfn-resolve-context.js";

/**
 * A primitive CloudFormation template value (null, boolean, number, string).
 */
export class SimCfnLiteral extends SimCfnNode {
  constructor(private readonly value: SimCfnTemplatePrimitiveValue) {
    super();
  }

  /**
   * Return the literal value, with any dynamic reference in it substituted.
   *
   * A dynamic reference is written into the template as ordinary text, so this
   * is where one is read. Substituting here rather than over the finished
   * value keeps `Fn::Split` and the other functions reading a resolved string:
   * splitting `{{resolve:ssm:name}}` on commas has to happen after Parameter
   * Store has answered it.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplatePrimitiveValue {
    if (typeof this.value !== "string") {
      return this.value;
    }

    return context.dynamicReferences?.substitute(this.value) ?? this.value;
  }
}
