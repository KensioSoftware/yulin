import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";

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
   * Resolve each value and join them with the delimiter.
   *
   * Joining happens only when every value has resolved to a string. If any
   * value is still an unresolved expression (for example a Resource `Ref`
   * during the up-front pass before Resources exist), this node re-emits
   * itself in template form. A later resolution pass can finish it once the
   * referenced Resources are available.
   *
   * A dynamic reference can be assembled out of the joined values, as CDK
   * writes one whenever the secret it reads sits in the same Stack: the
   * opening `{{resolve:secretsmanager:`, a `Ref` to the secret, and the
   * trailing segments. No single value holds a whole reference, so the
   * reference is read from the finished string, as `Fn::Sub` reads one built
   * out of its variables.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const resolved = this.values.map((value) =>
      this.resolveValue(value, context),
    );

    if (resolved.every((value): value is string => typeof value === "string")) {
      const joined = resolved.join(this.delimiter);

      return context.dynamicReferences?.substitute(joined) ?? joined;
    }

    return { "Fn::Join": [this.delimiter, resolved] };
  }

  /**
   * Collect referenced names from every joined value.
   */
  override referencedNames(): string[] {
    return this.values.flatMap((value) => value.referencedNames());
  }

  private resolveValue(
    value: SimCfnNode,
    context: SimCfnResolveContext,
  ): SimCfnTemplateValue {
    const resolved = value.resolve(context);

    if (typeof resolved === "string") {
      return resolved;
    }

    if (this.isDeferredExpression(resolved)) {
      return resolved;
    }

    throw new TypeError(
      `Sim CloudFormation Fn::Join values must each resolve to a string, got ${typeof resolved}`,
    );
  }

  /**
   * Whether a resolved value is still an unresolved intrinsic expression.
   *
   * Only object-shaped values (a preserved `Ref` or nested function object)
   * are treated as deferred. Other non-string primitives such as numbers are
   * genuine type errors.
   */
  private isDeferredExpression(value: SimCfnTemplateValue): boolean {
    return typeof value === "object" && value !== null;
  }
}
