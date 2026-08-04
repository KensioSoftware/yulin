import { SimCfnNode } from "./sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";
import type { SimCfnResolveContext } from "../resolve/sim-cfn-resolve-context.js";
import { resolveSimCfnValueAt } from "../value/sim-cfn-value-path.js";

/**
 * A CloudFormation template array of nodes.
 */
export class SimCfnList extends SimCfnNode {
  constructor(private readonly items: readonly SimCfnNode[]) {
    super();
  }

  /**
   * Resolve each item in the list, naming the position of one that fails.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue[] {
    return this.items.map((item, position) =>
      resolveSimCfnValueAt(position, () => item.resolve(context)),
    );
  }

  /**
   * Collect referenced names from every item.
   */
  override referencedNames(): string[] {
    return this.items.flatMap((item) => item.referencedNames());
  }
}
