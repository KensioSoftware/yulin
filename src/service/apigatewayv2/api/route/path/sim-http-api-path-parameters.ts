/**
 * One value a parameterised route path captured from a request path.
 */
export class SimHttpApiPathParameter {
  public readonly name: string;
  public readonly value: string;

  constructor(name: string, value: string) {
    this.name = name;
    this.value = value;
  }
}

/**
 * The values the matched route captured from the request path.
 *
 * This is a class rather than a record because matching builds it up one
 * segment at a time, and because an empty one has to stay tellable from one
 * with values in it. It becomes a record only at the event boundary, which is
 * the one place a handler reads it.
 */
export class SimHttpApiPathParameters {
  private readonly captured = new Map<string, string>();

  /**
   * Whether nothing was captured, which is what a route of only literal
   * segments produces.
   */
  get isEmpty(): boolean {
    return this.captured.size === 0;
  }

  /**
   * Take a captured value, if the segment that offered it captured one.
   *
   * A literal segment captures nothing, so it is allowed to offer nothing
   * rather than every caller having to ask whether there is anything to add.
   */
  add(parameter: SimHttpApiPathParameter | undefined): void {
    if (parameter === undefined) {
      return;
    }

    this.captured.set(parameter.name, parameter.value);
  }

  /**
   * The captured values as the event's `pathParameters` field holds them.
   */
  toRecord(): Record<string, string> {
    return Object.fromEntries(this.captured);
  }
}
