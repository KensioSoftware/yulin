import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { SimCffRequestMetadataAdapter } from "./sim-cff-request-metadata-adapter.js";

/**
 * Converts between Fetch API Request/Response objects and CloudFront Function
 * request/response shapes.
 */
export class SimCffRequestResponseAdapter {
  private readonly metadataAdapter = new SimCffRequestMetadataAdapter();

  /**
   * Convert a Node fetch Request to a CFF Request.
   */
  toCffRequest(request: Request): CloudFrontFunction.Request {
    const url = new URL(request.url);

    return {
      method: request.method,
      uri: url.pathname,
      headers: this.metadataAdapter.toCffHeaders(request.headers),
      querystring: this.metadataAdapter.toCffQueryString(url.searchParams),
      cookies: this.metadataAdapter.toCffCookies(request.headers),
    };
  }

  /**
   * Convert a Node fetch Response to a CFF Response.
   */
  toCffResponse(res: Response): CloudFrontFunction.Response {
    return {
      statusCode: res.status,
      statusDescription: res.statusText,
      headers: this.metadataAdapter.toCffHeaders(res.headers),
    };
  }

  /**
   * Convert a CFF Request to a Node fetch Request.
   */
  fromCffRequest(
    cffRequest: CloudFrontFunction.Request,
    originalRequest: Request,
  ): Request {
    const url = new URL(originalRequest.url);
    url.pathname = cffRequest.uri;
    url.search = this.metadataAdapter.fromCffQueryString(
      cffRequest.querystring,
    );
    const isAllowsBody = !/^(get|head)$/i.test(cffRequest.method);

    return new Request(url, {
      method: cffRequest.method,
      headers: this.metadataAdapter.fromCffHeaders(
        cffRequest.headers,
        cffRequest.cookies,
      ),
      body: isAllowsBody ? originalRequest.clone().body : null,
      duplex: "half",
      redirect: originalRequest.redirect,
      signal: originalRequest.signal,
    });
  }

  /**
   * Convert a CFF Response to a Node fetch Response.
   */
  fromCffResponse(cffRes: CloudFrontFunction.Response): Response {
    return new Response(this.cffResponseBody(cffRes), {
      status: cffRes.statusCode,
      statusText: cffRes.statusDescription ?? "",
      headers: this.metadataAdapter.fromCffHeaders(cffRes.headers, {}),
    });
  }

  /**
   * Convert a viewer-response CFF result to a Node fetch Response while preserving
   * the original response body.
   *
   * CloudFront Functions viewer-response events expose response metadata, but not
   * the body. A handler that returns event.response therefore normally returns no
   * body field. The simulator must not interpret that as "send an empty body",
   * because the returned headers may still include the origin response
   * content-length.
   */
  fromCffViewerResponse(
    cffRes: CloudFrontFunction.Response,
    originalResponse: Response,
  ): Response {
    return new Response(originalResponse.body, {
      status: cffRes.statusCode,
      statusText: cffRes.statusDescription ?? "",
      headers: this.metadataAdapter.fromCffHeaders(cffRes.headers, {}),
    });
  }

  private cffResponseBody(
    cffRes: CloudFrontFunction.Response,
  ): Buffer | string | null {
    if (cffRes.body === undefined) {
      return null;
    }

    if (cffRes.bodyEncoding === "base64") {
      return Buffer.from(cffRes.body, "base64");
    }

    return cffRes.body;
  }
}
