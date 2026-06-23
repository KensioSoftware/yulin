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
   * Resolve the reference.
   *
   * Parameters take precedence, then a referenced Resource's Ref value when a
   * Resource resolve is available. Otherwise the Ref is preserved unresolved,
   * which happens during the up-front pass before Resources exist.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    if (context.parameters.has(this.name)) {
      return context.parameters.value(this.name);
    }

    const pseudoParameterValue = context.pseudoParameters?.value(this.name);

    if (pseudoParameterValue !== undefined) {
      return pseudoParameterValue;
    }

    if (context.resources?.has(this.name) === true) {
      return context.resources.refValue(this.name);
    }

    return { Ref: this.name };
  }

  /**
   * Expose the referenced name for implicit dependency discovery.
   */
  override referencedNames(): string[] {
    return [this.name];
  }
}
