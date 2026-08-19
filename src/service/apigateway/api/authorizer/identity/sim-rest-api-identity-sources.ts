import { SimApiGatewayBadRequest } from "../../../error/sim-api-gateway.error.js";
import { SimRestApiIdentitySourceParser } from "./sim-rest-api-identity-source-parser.js";
import type { SimRestApiIdentitySource } from "./sim-rest-api-identity-source.js";

const parser = new SimRestApiIdentitySourceParser();

/**
 * The identity sources an authorizer is configured with.
 *
 * A REST API writes them as one comma-separated string, where an HTTP API
 * takes a list. A `TOKEN` authorizer names one header and a `REQUEST`
 * authorizer names as many headers and query string parameters as identify its
 * callers.
 *
 * API Gateway checks the whole set before it invokes anything: a request
 * missing any one of them is refused with a 401 and the function never runs.
 * The order they were configured in is kept, because that is the order their
 * values reach the authorizer in.
 */
export class SimRestApiIdentitySources {
  private readonly sources: readonly SimRestApiIdentitySource[];

  private constructor(sources: readonly SimRestApiIdentitySource[]) {
    this.sources = sources;
  }

  /**
   * Read the one header a `TOKEN` authorizer takes its token from.
   */
  static token(identitySource: string): SimRestApiIdentitySources {
    return new SimRestApiIdentitySources([parser.header(identitySource)]);
  }

  /**
   * Read the comma-separated expressions a `REQUEST` authorizer identifies its
   * callers by.
   *
   * Whitespace around a separator is dropped, since CDK's `IdentitySource`
   * writes the list joined by commas and a template written by hand often
   * spaces them out.
   */
  static request(identitySource: string): SimRestApiIdentitySources {
    const expressions = identitySource
      .split(",")
      .map((expression) => expression.trim())
      .filter((expression) => expression.length > 0);

    if (expressions.length === 0) {
      throw new SimApiGatewayBadRequest(
        `identitySource '${identitySource}' names nothing, so the ` +
          `authorizer would identify every caller the same way`,
      );
    }

    return new SimRestApiIdentitySources(
      expressions.map((expression) => parser.parse(expression)),
    );
  }

  /**
   * The expressions as they were written, joined the way the REST API reports
   * them back.
   */
  get expression(): string {
    return this.sources.map((source) => source.expression).join(",");
  }

  /**
   * The values this request carries, in the order the sources were configured,
   * or nothing at all when it is missing any one of them.
   *
   * These are the values rather than the expressions that found them, which is
   * what a `TOKEN` authorizer is handed as its `authorizationToken`.
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
