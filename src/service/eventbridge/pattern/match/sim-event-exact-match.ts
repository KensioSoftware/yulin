import { SimEventPatternMatch } from "./sim-event-pattern-match.js";

/**
 * A plain value written in a pattern, such as `"source": ["orders.service"]`.
 *
 * Comparison is exact and type-aware, so the string `"5"` in a pattern does not
 * match the number `5` in an event. `null` and the empty string are values like
 * any other, which is how a pattern says "this field is null" or "this field is
 * empty".
 */
export class SimEventExactMatch extends SimEventPatternMatch {
  private readonly expected: string | number | boolean | null;

  constructor(expected: string | number | boolean | null) {
    super();
    this.expected = expected;
  }

  /**
   * Whether a value the event carries is this exact value.
   */
  matchesValue(value: unknown): boolean {
    return value === this.expected;
  }
}
