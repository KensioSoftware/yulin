import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesChoiceTest } from "./sim-states-choice-test.js";

/**
 * An `And`, which holds where every test it carries does.
 */
export class SimStatesAllTest implements SimStatesChoiceTest {
  readonly #tests: readonly SimStatesChoiceTest[];

  constructor(tests: readonly SimStatesChoiceTest[]) {
    this.#tests = tests;
  }

  /**
   * The tests are made in the order they were written, and stop at the first
   * one that does not hold. That is what lets an `IsPresent` guard a
   * comparison of the same field further along the same `And`.
   */
  holds(input: JSONValue): boolean {
    return this.#tests.every((test) => test.holds(input));
  }
}

/**
 * An `Or`, which holds where any test it carries does.
 */
export class SimStatesAnyTest implements SimStatesChoiceTest {
  readonly #tests: readonly SimStatesChoiceTest[];

  constructor(tests: readonly SimStatesChoiceTest[]) {
    this.#tests = tests;
  }

  holds(input: JSONValue): boolean {
    return this.#tests.some((test) => test.holds(input));
  }
}

/**
 * A `Not`, which holds where the test it carries does not.
 */
export class SimStatesNotTest implements SimStatesChoiceTest {
  readonly #test: SimStatesChoiceTest;

  constructor(test: SimStatesChoiceTest) {
    this.#test = test;
  }

  holds(input: JSONValue): boolean {
    return !this.#test.holds(input);
  }
}
