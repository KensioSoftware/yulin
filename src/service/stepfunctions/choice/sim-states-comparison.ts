import type { JSONValue } from "../../../util/type-guard/json.js";

/**
 * What the definition writes as a comparator's operand.
 */
export type SimStatesOperandType = "string" | "number" | "boolean";

interface SimStatesComparisonProperties {
  readonly name: string;
  readonly operandType: SimStatesOperandType;
  readonly needsValue: boolean;
  readonly operandIsPath: boolean;
  readonly holds: SimStatesComparisonHolds;
}

export type SimStatesComparisonHolds = (
  variable: JSONValue | undefined,
  operand: JSONValue,
) => boolean;

/**
 * One `Choice` comparator, such as `NumericGreaterThan`.
 *
 * A comparator knows what its operand has to be, so a definition writing the
 * wrong kind is refused when the state machine is created rather than
 * answering false at every rule it appears in.
 */
export class SimStatesComparison {
  readonly name: string;
  readonly operandType: SimStatesOperandType;
  /**
   * Whether the rule's `Variable` has to select something.
   *
   * The data-test comparators, `IsPresent` and its siblings, are the ones that
   * answer for a field that is not there. Every other comparator fails the
   * execution instead, as real Step Functions does.
   */
  readonly needsValue: boolean;
  /** Whether the operand is a Reference Path into the state's input. */
  readonly operandIsPath: boolean;

  readonly #holds: SimStatesComparisonHolds;

  constructor(properties: SimStatesComparisonProperties) {
    this.name = properties.name;
    this.operandType = properties.operandType;
    this.needsValue = properties.needsValue;
    this.operandIsPath = properties.operandIsPath;
    this.#holds = properties.holds;
  }

  /**
   * Whether the value at the rule's `Variable` compares as the rule asks.
   */
  holds(variable: JSONValue | undefined, operand: JSONValue): boolean {
    return this.#holds(variable, operand);
  }

  /**
   * The same comparator with its operand read from the state's input.
   *
   * Every comparator taking an operand has a `Path` twin, which compares two
   * places in the same document instead of a place and a literal.
   */
  readingItsOperandFromAPath(): SimStatesComparison {
    return new SimStatesComparison({
      name: `${this.name}Path`,
      operandType: "string",
      needsValue: this.needsValue,
      operandIsPath: true,
      holds: this.#holds,
    });
  }
}
