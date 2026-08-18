import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { isSimCfnUnresolvedExpression } from "../../../value/sim-cfn-unresolved-expression.js";

/**
 * Simulated CloudFormation `Fn::ImportValue` intrinsic function.
 *
 * Standard shape:
 *
 * {
 *   "Fn::ImportValue": "ProducerStack:ExportsOutputRefSharedQueue"
 * }
 *
 * CDK emits one of these on the consumer whenever a Stack reads a value from
 * another Stack of the same app, paired with an Export on the producer.
 */
export class SimCfnFnImportValue extends SimCfnNode {
  constructor(private readonly exportName: SimCfnNode) {
    super();
  }

  /**
   * Read the value the named export was published with.
   *
   * An export name that is still an unresolved expression re-emits this
   * function in template form. A later resolution pass finishes it once the
   * Resources the name is built from exist. A name that has resolved is looked
   * up, and one no Stack has published is refused there.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const name = this.exportName.resolve(context);

    if (isSimCfnUnresolvedExpression(name)) {
      return { "Fn::ImportValue": name };
    }

    if (typeof name !== "string") {
      throw new TypeError(
        "Sim CloudFormation Fn::ImportValue export name must resolve to a " +
          `string, got ${typeof name}`,
      );
    }

    return context.exports.value(name);
  }

  /**
   * Collect referenced names from the export name.
   */
  override referencedNames(): string[] {
    return this.exportName.referencedNames();
  }
}
