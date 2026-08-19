import {
  type SimRestApiIdentitySource,
  simRestApiIdentityValue,
} from "./sim-rest-api-identity-source.js";

/**
 * The prefix a query string identity source is written with.
 */
export const simRestApiQueryStringIdentityPrefix =
  "method.request.querystring.";

/**
 * An identity source naming one query string parameter, such as
 * `method.request.querystring.access_token`.
 *
 * A repeated parameter supplies its first value, which is the one a mapping
 * expression reads on real API Gateway.
 */
export class SimRestApiQueryStringIdentitySource implements SimRestApiIdentitySource {
  public readonly expression: string;

  private readonly parameterName: string;

  constructor(parameterName: string) {
    this.expression = `${simRestApiQueryStringIdentityPrefix}${parameterName}`;
    this.parameterName = parameterName;
  }

  /**
   * The query string parameter this request carries, if it carries one.
   */
  value(request: Request): string | undefined {
    return simRestApiIdentityValue(
      new URL(request.url).searchParams.get(this.parameterName),
    );
  }
}
