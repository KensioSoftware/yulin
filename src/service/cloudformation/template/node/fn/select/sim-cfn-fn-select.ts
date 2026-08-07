import { SimCfnNode } from "../../sim-cfn-node.js";
import type { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";
import { isSimCfnUnresolvedExpression } from "../../../value/sim-cfn-unresolved-expression.js";
import { assertDefined } from "../../../../../../util/type-guard/defined.js";

/** A whole number written as a string, as JSON templates often write it. */
const wholeNumber = /^\d+$/u;

/**
 * Simulated CloudFormation `Fn::Select` intrinsic function.
 *
 * Standard shape:
 *
 * {
 *   "Fn::Select": [2, { "Fn::Split": ["/", "https://example.com/path"] }]
 * }
 */
export class SimCfnFnSelect extends SimCfnNode {
  constructor(
    private readonly index: SimCfnNode,
    private readonly values: SimCfnNode,
  ) {
    super();
  }

  /**
   * Pick the value at the zero-based index.
   *
   * An index or a list that is still an unresolved expression re-emits this
   * function in template form, so a later resolution pass can finish it once
   * the Resources it reads exist. The picked value itself may be unresolved,
   * which the same later pass resolves.
   */
  resolve(context: SimCfnResolveContext): SimCfnTemplateValue {
    const index = this.index.resolve(context);
    const values = this.values.resolve(context);

    if (
      isSimCfnUnresolvedExpression(index) ||
      isSimCfnUnresolvedExpression(values)
    ) {
      return { "Fn::Select": [index, values] };
    }

    if (!Array.isArray(values)) {
      throw new TypeError(
        `Sim CloudFormation Fn::Select values must resolve to a list, got ${typeof values}`,
      );
    }

    // CloudFormation rejects a list with a null in it, whichever value the
    // index picks, so this is refused rather than selected from.
    if (values.includes(null)) {
      throw new TypeError(
        "Sim CloudFormation Fn::Select values must not contain null",
      );
    }

    return this.valueAt(this.position(index), values);
  }

  /**
   * Collect referenced names from the index and the list.
   */
  override referencedNames(): string[] {
    return [...this.index.referencedNames(), ...this.values.referencedNames()];
  }

  private valueAt(
    position: number,
    values: readonly SimCfnTemplateValue[],
  ): SimCfnTemplateValue {
    if (position >= values.length) {
      throw new RangeError(
        `Sim CloudFormation Fn::Select index ${String(position)} is out of ` +
          `range for a list of ${String(values.length)} values`,
      );
    }

    // oxlint-disable-next-line security/detect-object-injection -- checked above
    const value = values[position];
    assertDefined(
      value,
      `Sim CloudFormation Fn::Select found no value at index ${String(position)}`,
    );

    return value;
  }

  /**
   * The list position an index argument names.
   *
   * CloudFormation accepts the index as a JSON number or as a string, because
   * a `Ref` to a Parameter can only give a string.
   */
  private position(index: SimCfnTemplateValue): number {
    if (
      typeof index === "number" &&
      Number.isSafeInteger(index) &&
      index >= 0
    ) {
      return index;
    }

    if (typeof index === "string" && wholeNumber.test(index)) {
      return Number(index);
    }

    throw new TypeError(
      `Sim CloudFormation Fn::Select index must be a whole number, got ${JSON.stringify(index)}`,
    );
  }
}
