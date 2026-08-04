import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { SimCfnNode } from "../../sim-cfn-node.js";

/**
 * Simulated CloudFormation `Fn::If` intrinsic function.
 *
 * The Condition it names is already evaluated by the time a template value is
 * resolved, so this only picks a branch. Only the branch it picks is resolved:
 * the other one is left alone, as CloudFormation leaves it alone, so it can
 * name something that the Stack being deployed does not have.
 */
export class SimCfnFnIf extends SimCfnNode {
  constructor(
    private readonly conditionName: string,
    private readonly whenTrue: SimCfnNode,
    private readonly whenFalse: SimCfnNode,
  ) {
    super();
  }

  /**
   * Resolve only the branch the named Condition selects.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const conditions = context.conditions;

    if (conditions === undefined) {
      throw new Error(
        `Sim CloudFormation Fn::If ${this.conditionName} cannot be resolved ` +
          "where the template Conditions are not available",
      );
    }

    if (!conditions.has(this.conditionName)) {
      throw new Error(
        `Sim CloudFormation Fn::If names Condition ${this.conditionName}, ` +
          "which the template does not define",
      );
    }

    return conditions.value(this.conditionName)
      ? this.whenTrue.resolve(context)
      : this.whenFalse.resolve(context);
  }

  /**
   * Collect referenced names from both branches.
   *
   * Which branch is taken is not known while the dependency graph is being
   * built, so both contribute. Ordering against a Resource that is never
   * created costs nothing, where a missed dependency would create a Resource
   * before the one it reads.
   */
  override referencedNames(): string[] {
    return [
      ...this.whenTrue.referencedNames(),
      ...this.whenFalse.referencedNames(),
    ];
  }
}
