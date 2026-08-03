import type { SimHttpApiIdentitySource } from "./sim-http-api-identity-source.js";

/**
 * The identity sources a Lambda `REQUEST` authorizer is configured with.
 *
 * A `REQUEST` authorizer takes a list rather than the single source a JWT
 * authorizer takes, and API Gateway checks the whole list before it invokes
 * anything: a request missing any one of them is refused with a 401 and the
 * authorizer function never runs.
 */
export class SimHttpApiIdentitySources {
  private readonly sources: readonly SimHttpApiIdentitySource[];

  constructor(sources: readonly SimHttpApiIdentitySource[]) {
    this.sources = [...sources];
  }

  /**
   * The expressions as they were written, which is what the API reports back.
   */
  get expressions(): string[] {
    return this.sources.map((source) => source.expression);
  }

  /**
   * The values this request carries, in the order the sources were configured,
   * or nothing at all when it is missing any one of them.
   *
   * This is what reaches the authorizer as the event's `identitySource`: the
   * values rather than the expressions that found them.
   */
  values(request: Request): string[] | undefined {
    const values: string[] = [];

    for (const source of this.sources) {
      const value = source.value(request);

      if (value === undefined) {
        return undefined;
      }

      values.push(value);
    }

    return values;
  }
}
