/**
 * A request value rendered in a form two of them can be compared by.
 *
 * A structured input arrives as plain JSON, from a template or from an SDK
 * call, and the order its keys were written in carries no meaning. Rendering
 * it with the keys in a fixed order makes two values that say the same thing
 * render the same, and gives a refusal something readable to print back.
 */
export class SimCognitoCanonicalValue {
  private readonly value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }

  /**
   * The rendered value.
   */
  get text(): string {
    return JSON.stringify(this.ordered(this.value));
  }

  /**
   * Whether this value says the same thing as another.
   */
  matches(other: unknown): boolean {
    return this.text === new SimCognitoCanonicalValue(other).text;
  }

  /**
   * The value with every object's keys in a fixed order.
   *
   * A list keeps the order it arrived in, because the order of a list is part
   * of what it says. An object's is not.
   */
  private ordered(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item: unknown) => this.ordered(item));
    }

    if (typeof value !== "object" || value === null) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, this.ordered(nested)]),
    );
  }
}
