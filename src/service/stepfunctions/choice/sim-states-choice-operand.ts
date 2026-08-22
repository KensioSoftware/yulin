import type { JSONValue } from "../../../util/type-guard/json.js";
import { selectSimStatesPath } from "../data/sim-states-path-segment.js";
import type { SimStatesPathSegment } from "../data/sim-states-path-segment.js";
import { SimStatesRuntimeFailure } from "../error/sim-step-functions.error.js";

/**
 * The value one side of a comparison is made against.
 */
export interface SimStatesChoiceOperand {
  valueIn(input: JSONValue): JSONValue;
}

/**
 * An operand the definition wrote out, as in `NumericEquals: 3`.
 */
export class SimStatesLiteralOperand implements SimStatesChoiceOperand {
  readonly #value: JSONValue;

  constructor(value: JSONValue) {
    this.#value = value;
  }

  valueIn(): JSONValue {
    return this.#value;
  }
}

/**
 * An operand read from the state's input, as in `NumericEqualsPath: "$.want"`.
 *
 * A path selecting nothing fails the execution. The comparison has no value to
 * make, and answering false would read as a rule that was tested and did not
 * match.
 */
export class SimStatesPathOperand implements SimStatesChoiceOperand {
  readonly #path: string;
  readonly #segments: readonly SimStatesPathSegment[];

  constructor(path: string, segments: readonly SimStatesPathSegment[]) {
    this.#path = path;
    this.#segments = segments;
  }

  valueIn(input: JSONValue): JSONValue {
    const value = selectSimStatesPath(input, this.#segments);

    if (value === undefined) {
      throw new SimStatesRuntimeFailure(
        `A Choice rule reads its operand from ${this.#path}, which selects ` +
          "nothing in the state's input.",
      );
    }

    return value;
  }
}
