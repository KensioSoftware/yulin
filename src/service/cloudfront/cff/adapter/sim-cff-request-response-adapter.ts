import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { simAwsRequestHostname } from "../../../../serve/http/url/sim-aws-request-hostname.js";
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
      headers: this.viewerCffHeaders(request),
      querystring: this.metadataAdapter.toCffQueryString(url.searchParams),
      cookies: this.metadataAdapter.toCffCookies(request.headers),
    };
  }

  /**
   * Convert a Node fetch Response to a CFF Response.
   */
  toCffResponse(response: Response): CloudFrontFunction.Response {
    return {
      statusCode: response.status,
      statusDescription: response.statusText,
      headers: this.metadataAdapter.toCffHeaders(response.headers),
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

    const headers = this.metadataAdapter.fromCffHeaders(
      cffRequest.headers,
      cffRequest.cookies,
    );
    this.restoreViewerHost(headers, originalRequest);

    return new Request(url, {
      method: cffRequest.method,
      headers,
      body: isAllowsBody ? originalRequest.clone().body : null,
      duplex: "half",
      redirect: originalRequest.redirect,
      signal: originalRequest.signal,
    });
  }

  /**
   * Convert a CFF Response to a Node fetch Response.
   */
  fromCffResponse(cffResponse: CloudFrontFunction.Response): Response {
    return new Response(this.cffResponseBody(cffResponse), {
      status: cffResponse.statusCode,
      statusText: cffResponse.statusDescription ?? "",
      headers: this.metadataAdapter.fromCffHeaders(cffResponse.headers, {}),
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
    cffResponse: CloudFrontFunction.Response,
    originalResponse: Response,
  ): Response {
    return new Response(originalResponse.body, {
      status: cffResponse.statusCode,
      statusText: cffResponse.statusDescription ?? "",
      headers: this.metadataAdapter.fromCffHeaders(cffResponse.headers, {}),
    });
  }

  /**
   * Convert request headers to CFF Headers, with the host CloudFront presents.
   *
   * A CloudFront Function sees the hostname the viewer used to reach
   * CloudFront: the Distribution domain name or one of its alternate domain
   * names. A request served on localhost arrives with the Yulin-local host
   * instead, which is the same hostname the Distribution router already
   * resolves the request by, so it is normalised here as well.
   */
  private viewerCffHeaders(request: Request): CloudFrontFunction.Headers {
    const cffHeaders = this.metadataAdapter.toCffHeaders(request.headers);
    cffHeaders["host"] = { value: simAwsRequestHostname(request) };

    return cffHeaders;
  }

  /**
   * Restore the host the request arrived with.
   *
   * The host header is read-only for CloudFront Functions, so a host a
   * function returns is discarded rather than sent on. That also keeps the
   * Yulin-local host on the request continuing to the Origin, which is what
   * the rest of the simulated environment resolves.
   */
  private restoreViewerHost(headers: Headers, originalRequest: Request): void {
    const viewerHost = originalRequest.headers.get("host");

    if (viewerHost === null) {
      headers.delete("host");
      return;
    }

    headers.set("host", viewerHost);
  }

  private cffResponseBody(
    cffResponse: CloudFrontFunction.Response,
  ): Buffer | string | null {
    if (cffResponse.body === undefined) {
      return null;
    }

    if (cffResponse.bodyEncoding === "base64") {
      return Buffer.from(cffResponse.body, "base64");
    }

    return cffResponse.body;
  }
}
