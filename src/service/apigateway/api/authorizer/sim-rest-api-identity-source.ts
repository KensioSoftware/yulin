import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * The prefix a header identity source is written with.
 */
export const simRestApiHeaderIdentityPrefix = "method.request.header.";

/**
 * The characters an HTTP field name holds, which is the RFC 9110 token.
 */
const httpFieldName = /^[!#$%&'*+.^_`|~\w-]+$/u;

/**
 * Where a `TOKEN` authorizer takes the token it identifies the caller by.
 *
 * The expression is a request mapping expression naming one header, such as
 * `method.request.header.Authorization`. A `TOKEN` authorizer reads a header
 * and nothing else, which is the rule real API Gateway holds one to.
 *
 * Header names are matched case-insensitively, which is what `Headers` does
 * and what HTTP requires.
 */
export class SimRestApiIdentitySource {
  /**
   * The expression as it was written, which is what the API reports back.
   */
  public readonly expression: string;

  private readonly headerName: string;

  private constructor(headerName: string) {
    this.expression = `${simRestApiHeaderIdentityPrefix}${headerName}`;
    this.headerName = headerName;
  }

  /**
   * Read an identity source expression, refusing one naming anywhere a
   * `TOKEN` authorizer cannot read from.
   *
   * An expression this simulation would look for nowhere is refused when the
   * authorizer is created. An authorizer that never finds what it looks for
   * refuses every request, and that reads like a signing problem rather than
   * the configuration one it is.
   */
  static parse(expression: string): SimRestApiIdentitySource {
    if (!expression.startsWith(simRestApiHeaderIdentityPrefix)) {
      throw new SimApiGatewayBadRequest(
        `identitySource '${expression}' is not simulated: a TOKEN ` +
          `authorizer reads one header, written as ` +
          `'${simRestApiHeaderIdentityPrefix}<name>'`,
      );
    }

    return new SimRestApiIdentitySource(
      headerName(
        expression,
        expression.slice(simRestApiHeaderIdentityPrefix.length),
      ),
    );
  }

  /**
   * What this request carries at this identity source, if it carries anything.
   *
   * An empty value counts as nothing. Real API Gateway refuses a request whose
   * identity source it finds nothing at, with a 401 and without invoking the
   * authorizer.
   */
  value(request: Request): string | undefined {
    const value = request.headers.get(this.headerName);

    if (value === null || value.trim().length === 0) {
      return undefined;
    }

    return value;
  }
}

/**
 * The header an expression names, refusing one no request could carry.
 *
 * Reading a header by an invalid name throws, and it would throw on every
 * request to the method rather than on the command that configured it.
 */
function headerName(expression: string, name: string): string {
  if (name.length === 0) {
    throw new SimApiGatewayBadRequest(
      `identitySource '${expression}' names no header, so it would find ` +
        `nothing on every request`,
    );
  }

  if (!httpFieldName.test(name)) {
    throw new SimApiGatewayBadRequest(
      `identitySource '${expression}' names the header '${name}', which is ` +
        `not a header name: an HTTP field name holds letters, digits and ` +
        `the characters !#$%&'*+-.^_\`|~`,
    );
  }

  return name;
}
