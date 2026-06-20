import { SimCfnNode, type SimCfnResolveContext } from "./sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

/**
 * A CloudFormation template array of nodes.
 */
export class SimCfnList extends SimCfnNode {
  constructor(private readonly items: readonly SimCfnNode[]) {
    super();
  }

  /**
   * Resolve each item in the list.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue[] {
    return this.items.map((item) => item.resolve(context));
  }

  /**
   * Collect referenced names from every item.
   */
  override referencedNames(): string[] {
    return this.items.flatMap((item) => item.referencedNames());
  }
}
