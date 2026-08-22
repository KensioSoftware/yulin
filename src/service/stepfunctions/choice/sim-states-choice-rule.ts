import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesChoiceTest } from "./sim-states-choice-test.js";

/**
 * One rule in a `Choice` state's `Choices`, and the state a match moves to.
 */
export class SimStatesChoiceRule {
  readonly next: string;

  readonly #test: SimStatesChoiceTest;

  constructor(test: SimStatesChoiceTest, next: string) {
    this.#test = test;
    this.next = next;
  }

  /**
   * Whether this rule's test holds for the state's effective input.
   */
  matches(input: JSONValue): boolean {
    return this.#test.holds(input);
  }
}
