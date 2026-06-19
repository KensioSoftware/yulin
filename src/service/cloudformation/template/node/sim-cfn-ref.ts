import { SimCfnNode, type SimCfnResolveContext } from "./sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

/**
 * A CloudFormation `{ "Ref": "Name" }` expression.
 */
export class SimCfnRef extends SimCfnNode {
  constructor(private readonly name: string) {
    super();
  }

  /**
   * Resolve the reference from parameters, or preserve it if it is unknown.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    if (context.parameters.has(this.name)) {
      return context.parameters.value(this.name);
    }

    return { Ref: this.name };
  }
}
