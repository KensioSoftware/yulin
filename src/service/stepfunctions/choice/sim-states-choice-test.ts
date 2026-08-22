import type { JSONValue } from "../../../util/type-guard/json.js";
import { selectSimStatesPath } from "../data/sim-states-path-segment.js";
import type { SimStatesPathSegment } from "../data/sim-states-path-segment.js";
import { SimStatesRuntimeFailure } from "../error/sim-step-functions.error.js";
import type { SimStatesChoiceOperand } from "./sim-states-choice-operand.js";
import type { SimStatesComparison } from "./sim-states-comparison.js";

/**
 * One test a `Choice` rule makes against the state's input.
 */
export interface SimStatesChoiceTest {
  holds(input: JSONValue): boolean;
}

interface SimStatesVariableTestProperties {
  readonly path: string;
  readonly segments: readonly SimStatesPathSegment[];
  readonly comparison: SimStatesComparison;
  readonly operand: SimStatesChoiceOperand;
}

/**
 * A comparison of the value at a `Variable` path against an operand.
 */
export class SimStatesVariableTest implements SimStatesChoiceTest {
  readonly #path: string;
  readonly #segments: readonly SimStatesPathSegment[];
  readonly #comparison: SimStatesComparison;
  readonly #operand: SimStatesChoiceOperand;

  constructor(properties: SimStatesVariableTestProperties) {
    this.#path = properties.path;
    this.#segments = properties.segments;
    this.#comparison = properties.comparison;
    this.#operand = properties.operand;
  }

  /**
   * Compare, failing the execution where the field being compared is absent.
   *
   * Real Step Functions fails a `Choice` state whose `Variable` selects
   * nothing, which is why `IsPresent` exists. The data-test comparators answer
   * for an absent field of their own accord.
   */
  holds(input: JSONValue): boolean {
    const value = selectSimStatesPath(input, this.#segments);

    if (value === undefined && this.#comparison.needsValue) {
      throw new SimStatesRuntimeFailure(
        `A Choice rule compares ${this.#path} with ` +
          `${this.#comparison.name}, and the state's input holds nothing ` +
          "there. Test it with IsPresent first where it may be absent.",
      );
    }

    return this.#comparison.holds(value, this.#operand.valueIn(input));
  }
}
