import type { SimLambdaFunctionUrlCors } from "../../function/url/sim-lambda-function-url-cors.js";

/**
 * The request header a browser states the method it is asking about in.
 *
 * A preflight names it and nothing else does. That is what separates a
 * preflight from an ordinary `OPTIONS` request the function should handle.
 */
const requestMethodHeader = "access-control-request-method";

/**
 * The CORS headers one Function URL configuration decides for a request.
 *
 * Lambda adds these to every response the URL serves, and answers a preflight
 * with them itself. `AllowOrigins` is the one member whose header depends on
 * the request. A browser reads one value there, so Lambda sends back either the
 * Origin that asked or the wildcard.
 *
 * https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html
 */
export class SimLambdaUrlCorsHeaders {
  private readonly cors: SimLambdaFunctionUrlCors;

  constructor(cors: SimLambdaFunctionUrlCors) {
    this.cors = cors;
  }

  /**
   * Whether this request is the preflight a browser sends before a
   * cross-origin call it is not allowed to make blind.
   */
  isPreflight(request: Request): boolean {
    return (
      request.method === "OPTIONS" &&
      request.headers.has("origin") &&
      request.headers.has(requestMethodHeader)
    );
  }

  /**
   * The answer Lambda gives a preflight request itself.
   *
   * The function never runs for one. The configured headers are the whole
   * response, and the handler has said nothing that could conflict with them.
   */
  preflightResponse(request: Request): Response {
    const headers = new Headers();
    this.apply(headers, request);

    return new Response(null, { status: 200, headers });
  }

  /**
   * Add the configured CORS headers to a response the function produced.
   *
   * They are appended. A handler that sends CORS headers of its own keeps them
   * and the response carries both values, which is what AWS documents for
   * anything but a preflight.
   */
  apply(headers: Headers, request: Request): void {
    const allowOrigin = this.allowOrigin(request.headers.get("origin"));

    if (allowOrigin !== undefined) {
      headers.append("access-control-allow-origin", allowOrigin);
    }

    // A false Access-Control-Allow-Credentials is not a value the fetch spec
    // recognises. The header is left off instead.
    if (this.cors.AllowCredentials === true) {
      headers.append("access-control-allow-credentials", "true");
    }

    this.appendList(headers, "allow-methods", this.cors.AllowMethods);
    this.appendList(headers, "allow-headers", this.cors.AllowHeaders);
    this.appendList(headers, "expose-headers", this.cors.ExposeHeaders);

    if (this.cors.MaxAge !== undefined) {
      headers.append("access-control-max-age", String(this.cors.MaxAge));
    }
  }

  /**
   * Which Origin this request is told it may read the response from.
   *
   * A list holding the wildcard allows every Origin outright. Otherwise the
   * Origin has to be one the list names. A request carrying no Origin at all,
   * such as one from curl, is told nothing.
   */
  private allowOrigin(requestOrigin: string | null): string | undefined {
    const allowOrigins = this.cors.AllowOrigins ?? [];

    if (allowOrigins.includes("*")) {
      return "*";
    }

    if (requestOrigin === null || !allowOrigins.includes(requestOrigin)) {
      return undefined;
    }

    return requestOrigin;
  }

  /**
   * Send a configured list as one comma-separated header.
   *
   * An empty list names nothing. A header carrying an empty value says
   * something else to a browser, so the header is left off.
   */
  private appendList(
    headers: Headers,
    suffix: string,
    values: readonly string[] | undefined,
  ): void {
    if (values === undefined || values.length === 0) {
      return;
    }

    headers.append(`access-control-${suffix}`, values.join(","));
  }
}
