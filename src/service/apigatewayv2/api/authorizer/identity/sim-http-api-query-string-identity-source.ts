import {
  type SimHttpApiIdentityInput,
  type SimHttpApiIdentitySource,
  simHttpApiIdentityValue,
} from "./sim-http-api-identity-source.js";

/**
 * The prefix a query string identity source is written with.
 */
export const simHttpApiQueryStringIdentityPrefix = "$request.querystring.";

/**
 * An identity source naming one query string parameter, such as
 * `$request.querystring.access_token`.
 */
export class SimHttpApiQueryStringIdentitySource implements SimHttpApiIdentitySource {
  public readonly expression: string;

  private readonly parameterName: string;

  constructor(parameterName: string) {
    this.expression = `${simHttpApiQueryStringIdentityPrefix}${parameterName}`;
    this.parameterName = parameterName;
  }

  /**
   * The query string parameter this request carries, if it carries one.
   */
  value(input: SimHttpApiIdentityInput): string | undefined {
    return simHttpApiIdentityValue(
      new URL(input.request.url).searchParams.get(this.parameterName),
    );
  }
}
