const sigV4AuthorizationPrefix = "AWS4-HMAC-SHA256";
const htmlContentType = "text/html";
const awsNamePrefix = "x-amz-";

/**
 * Whether any of these header or query parameter names is an AWS one.
 */
function hasAwsPrefixed(names: IterableIterator<string>): boolean {
  for (const name of names) {
    if (name.toLowerCase().startsWith(awsNamePrefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Decides whether a response can carry the live reload script.
 *
 * The simulator's own account of a request goes in headers and never in the
 * body, so that a response keeps the shape the real service returns. Injecting
 * a script breaks that rule, and these checks are what keep the breakage to the
 * one case it is worth it for: an HTML page a browser is about to render.
 *
 * Everything else comes back untouched. An SDK reading an HTML Object out of a
 * Bucket has to get the bytes that were stored, and a range or an encoded body
 * cannot take an insertion at all.
 */
export class SimLiveReloadInjectable {
  /**
   * Whether the script belongs in this response.
   */
  allows(request: Request, response: Response): boolean {
    return (
      this.hasBody(request, response) &&
      this.isWholeResponse(response) &&
      this.isPlainHtml(response) &&
      this.isBrowserRequest(request) &&
      !this.isSignedRequest(request) &&
      !this.isSdkRequest(request)
    );
  }

  private hasBody(request: Request, response: Response): boolean {
    return request.method !== "HEAD" && response.body !== null;
  }

  /**
   * A partial response is a slice of a body, and a slice cannot take an
   * insertion without the offsets the client already asked for going wrong.
   */
  private isWholeResponse(response: Response): boolean {
    return response.status !== 206;
  }

  /**
   * The media type has to be `text/html` itself, not merely start with it, so a
   * type such as `text/htmlx` is left alone. An encoded body would have to be
   * decoded, changed and re-encoded, and the simulator has no reason to be in
   * that business.
   */
  private isPlainHtml(response: Response): boolean {
    const contentType = response.headers.get("content-type") ?? "";
    const [mediaType = ""] = contentType.split(";");

    return (
      mediaType.trim().toLowerCase() === htmlContentType &&
      !response.headers.has("content-encoding")
    );
  }

  /**
   * Something asking for HTML is something that will render it.
   */
  private isBrowserRequest(request: Request): boolean {
    const accept = request.headers.get("accept") ?? "";

    return accept.toLowerCase().includes(htmlContentType);
  }

  /**
   * A signature comes either in a header or, for a presigned URL, in the query
   * string. A presigned URL is the one signed request a browser makes with an
   * ordinary HTML `accept` header, which is what an address bar sends, so
   * missing it would mean handing back an Object with bytes added to it.
   */
  private isSignedRequest(request: Request): boolean {
    const authorization = request.headers.get("authorization") ?? "";

    return (
      authorization.startsWith(sigV4AuthorizationPrefix) ||
      hasAwsPrefixed(new URL(request.url).searchParams.keys())
    );
  }

  /**
   * An `x-amz-*` header is an AWS client talking, whether it signed or not.
   */
  private isSdkRequest(request: Request): boolean {
    return hasAwsPrefixed(request.headers.keys());
  }
}
