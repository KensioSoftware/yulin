import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import { isSimCfnUnresolvedExpression } from "../../../value/sim-cfn-unresolved-expression.js";

/**
 * Simulated CloudFormation `Fn::Join` intrinsic function.
 *
 * Standard shape:
 *
 * {
 *   "Fn::Join": ["-", ["a", "b", { "Ref": "Name" }]]
 * }
 *
 * The values may also come from one function that returns the whole list:
 *
 * {
 *   "Fn::Join": [",", { "Fn::GetAtt": ["Zone", "NameServers"] }]
 * }
 */
export class SimCfnFnJoin extends SimCfnNode {
  constructor(
    private readonly delimiter: string,
    private readonly values: SimCfnNode,
  ) {
    super();
  }

  /**
   * Resolve the values and join them with the delimiter.
   *
   * Joining happens only when the values have resolved to a list of strings.
   * If the list, or any value in it, is still an unresolved expression (for
   * example a Resource `Ref` during the up-front pass before Resources exist),
   * this node re-emits itself in template form. A later resolution pass can
   * finish it once the referenced Resources are available.
   *
   * A dynamic reference can be assembled out of the joined values, as CDK
   * writes one whenever the secret it reads sits in the same Stack: the
   * opening `{{resolve:secretsmanager:`, a `Ref` to the secret, and the
   * trailing segments. No single value holds a whole reference, so the
   * reference is read from the finished string, as `Fn::Sub` reads one built
   * out of its variables.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const values = this.values.resolve(context);

    if (isSimCfnUnresolvedExpression(values)) {
      return { "Fn::Join": [this.delimiter, values] };
    }

    if (!Array.isArray(values)) {
      throw new TypeError(
        `Sim CloudFormation Fn::Join values must resolve to a list, got ${describe(values)}`,
      );
    }

    for (const value of values) {
      this.assertJoinable(value);
    }

    if (values.every((value): value is string => typeof value === "string")) {
      const joined = values.join(this.delimiter);

      return context.dynamicReferences?.substitute(joined) ?? joined;
    }

    return { "Fn::Join": [this.delimiter, values] };
  }

  /**
   * Collect referenced names from the values.
   */
  override referencedNames(): string[] {
    return this.values.referencedNames();
  }

  /**
   * Refuse a value that can never become a string.
   *
   * A string joins now, and an unresolved expression may join on a later
   * pass. Anything else (a number, a nested list, a plain object) is a type
   * error, as CloudFormation joins a list of strings only.
   */
  private assertJoinable(value: SimCfnTemplateValue): void {
    if (typeof value === "string" || isSimCfnUnresolvedExpression(value)) {
      return;
    }

    throw new TypeError(
      `Sim CloudFormation Fn::Join values must each resolve to a string, got ${describe(value)}`,
    );
  }
}

/**
 * Name a resolved value's type for an error message, telling a list and a
 * null apart from an object.
 */
function describe(value: SimCfnTemplateValue): string {
  if (Array.isArray(value)) {
    return "list";
  }

  return value === null ? "null" : typeof value;
}
