import { SimCfnNode } from "./sim-cfn-node.js";
import type { SimCfnTemplatePrimitiveValue } from "../value/sim-cfn-template-value.js";

/**
 * A primitive CloudFormation template value (null, boolean, number, string).
 */
export class SimCfnLiteral extends SimCfnNode {
  constructor(private readonly value: SimCfnTemplatePrimitiveValue) {
    super();
  }

  /**
   * Return the literal value unchanged.
   */
  resolve(): SimCfnTemplatePrimitiveValue {
    return this.value;
  }
}
