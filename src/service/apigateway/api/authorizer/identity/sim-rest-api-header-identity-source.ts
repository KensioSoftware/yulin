import {
  type SimRestApiIdentitySource,
  simRestApiIdentityValue,
} from "./sim-rest-api-identity-source.js";

/**
 * The prefix a header identity source is written with.
 */
export const simRestApiHeaderIdentityPrefix = "method.request.header.";

/**
 * An identity source naming one request header, such as
 * `method.request.header.Authorization`.
 *
 * Header names are matched case-insensitively, which is what `Headers` does
 * and what HTTP requires.
 */
export class SimRestApiHeaderIdentitySource implements SimRestApiIdentitySource {
  public readonly expression: string;

  private readonly headerName: string;

  constructor(headerName: string) {
    this.expression = `${simRestApiHeaderIdentityPrefix}${headerName}`;
    this.headerName = headerName;
  }

  /**
   * The header this request carries, if it carries one.
   */
  value(request: Request): string | undefined {
    return simRestApiIdentityValue(request.headers.get(this.headerName));
  }
}
