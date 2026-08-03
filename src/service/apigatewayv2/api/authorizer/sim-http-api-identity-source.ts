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
 * Where an authorizer takes what it identifies the caller by.
 *
 * An identity source is a request mapping expression naming one header or one
 * query string parameter. Anything else is refused rather than accepted and
 * looked for nowhere, since a route whose authorizer never finds what it looks
 * for refuses every request, which looks like a signing problem rather than a
 * configuration one. That leaves out `$context.*` and `$stagevariables.*`,
 * which a Lambda `REQUEST` authorizer may also name.
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
   * What this request carries at this identity source, if it carries anything.
   *
   * An empty value is the same as no value here: real API Gateway treats a
   * source it finds nothing at as one the request did not supply, and refuses
   * the request without asking the authorizer anything.
   */
  value(request: Request): string | undefined {
    return this.present(this.rawValue(request)?.trim());
  }

  /**
   * The token this request carries, if it carries one at all.
   *
   * The bearer scheme is stripped when it is there, which is what a JWT
   * authorizer does with it. A `REQUEST` authorizer is handed the value as it
   * arrived instead, since it may be a cookie or an API key rather than a
   * bearer token.
   */
  token(request: Request): string | undefined {
    const value = this.value(request);

    if (value === undefined) {
      return undefined;
    }

    return this.present(value.replace(bearerPrefix, "").trim());
  }

  /**
   * A value the request actually supplied, rather than an empty one.
   */
  private present(value: string | undefined): string | undefined {
    if (value === undefined || value.length === 0) {
      return undefined;
    }

    return value;
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
