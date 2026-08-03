import {
  type SimHttpApiIdentityInput,
  type SimHttpApiIdentitySource,
  simHttpApiIdentityValue,
} from "./sim-http-api-identity-source.js";

/**
 * The prefix a header identity source is written with.
 */
export const simHttpApiHeaderIdentityPrefix = "$request.header.";

/**
 * An identity source naming one request header, such as
 * `$request.header.Authorization`.
 *
 * Header names are matched case-insensitively, which is what `Headers` does
 * and what HTTP requires.
 */
export class SimHttpApiHeaderIdentitySource implements SimHttpApiIdentitySource {
  public readonly expression: string;

  private readonly headerName: string;

  constructor(headerName: string) {
    this.expression = `${simHttpApiHeaderIdentityPrefix}${headerName}`;
    this.headerName = headerName;
  }

  /**
   * The header this request carries, if it carries one.
   */
  value(input: SimHttpApiIdentityInput): string | undefined {
    return simHttpApiIdentityValue(input.request.headers.get(this.headerName));
  }
}
