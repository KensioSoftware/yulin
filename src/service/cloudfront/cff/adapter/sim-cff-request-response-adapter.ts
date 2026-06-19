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
  toCffRequest(req: Request): CloudFrontFunction.Request {
    const url = new URL(req.url);

    return {
      method: req.method,
      uri: url.pathname,
      headers: this.metadataAdapter.toCffHeaders(req.headers),
      querystring: this.metadataAdapter.toCffQueryString(url.searchParams),
      cookies: this.metadataAdapter.toCffCookies(req.headers),
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
    cffReq: CloudFrontFunction.Request,
    originalReq: Request,
  ): Request {
    const url = new URL(originalReq.url);
    url.pathname = cffReq.uri;
    url.search = this.metadataAdapter.fromCffQueryString(cffReq.querystring);
    const allowsBody = !/^(get|head)$/i.test(cffReq.method);

    return new Request(url, {
      method: cffReq.method,
      headers: this.metadataAdapter.fromCffHeaders(
        cffReq.headers,
        cffReq.cookies,
      ),
      body: allowsBody ? originalReq.clone().body : null,
      duplex: "half",
      redirect: originalReq.redirect,
      signal: originalReq.signal,
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
