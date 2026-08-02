import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";

/**
 * The two request mapping expressions an identity source is written with.
 */
const headerPrefix = "$request.header.";
const queryStringPrefix = "$request.querystring.";

/**
 * The authorization scheme a bearer token is usually sent under.
 *
 * API Gateway takes the token with or without it, so it is stripped when it is
 * there rather than required. The comparison is case-insensitive, since HTTP
 * authorization schemes are.
 */
const bearerPrefix = /^bearer\s+/i;

/**
 * Where a JWT authorizer takes the token from.
 *
 * An identity source is a request mapping expression naming one header or one
 * query string parameter. Anything else is refused rather than accepted and
 * looked for nowhere, since a route whose authorizer never finds a token
 * refuses every request, which looks like a signing problem rather than a
 * configuration one.
 */
export class SimHttpApiIdentitySource {
  /**
   * The expression as it was written, which is what the API reports back.
   */
  public readonly expression: string;

  private readonly headerName: string | undefined;
  private readonly queryStringName: string | undefined;

  private constructor(properties: {
    readonly expression: string;
    readonly headerName?: string;
    readonly queryStringName?: string;
  }) {
    this.expression = properties.expression;
    this.headerName = properties.headerName;
    this.queryStringName = properties.queryStringName;
  }

  /**
   * Read an identity source expression, or refuse it.
   */
  static parse(expression: string): SimHttpApiIdentitySource {
    if (expression.startsWith(headerPrefix)) {
      return new SimHttpApiIdentitySource({
        expression,
        headerName: expression.slice(headerPrefix.length),
      });
    }

    if (expression.startsWith(queryStringPrefix)) {
      return new SimHttpApiIdentitySource({
        expression,
        queryStringName: expression.slice(queryStringPrefix.length),
      });
    }

    throw new SimApiGatewayV2BadRequest(
      `IdentitySource '${expression}' is not simulated: an identity source ` +
        `is '${headerPrefix}<name>' or '${queryStringPrefix}<name>'`,
    );
  }

  /**
   * The token this request carries, if it carries one at all.
   *
   * An empty value is the same as no value here: real API Gateway has nothing
   * to decode either way, and both answer the same 401.
   */
  token(request: Request): string | undefined {
    const value = this.rawValue(request);

    if (value === undefined) {
      return undefined;
    }

    const token = value.replace(bearerPrefix, "").trim();

    return token.length === 0 ? undefined : token;
  }

  private rawValue(request: Request): string | undefined {
    if (this.headerName !== undefined) {
      return request.headers.get(this.headerName) ?? undefined;
    }

    /* v8 ignore next -- one of the two names is always set by the parser */
    const name = this.queryStringName ?? "";

    return new URL(request.url).searchParams.get(name) ?? undefined;
  }
}
