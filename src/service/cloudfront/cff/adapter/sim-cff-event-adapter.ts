import { randomUUID } from "node:crypto";

import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";

/**
 * Converts between native Fetch API Request/Response objects and the
 * CloudFront Function event/request/response shapes.
 */
export class SimCffEventAdapter {
  /**
   * Adapt a Request into a ViewerRequestEvent.
   */
  toViewerRequestEvent(req: Request): CloudFrontFunction.ViewerRequestEvent {
    return {
      context: {
        eventType: "viewer-request",
        requestId: randomUUID(),
      },
      viewer: {
        ip: "127.0.0.1",
      },
      request: this.toCffRequest(req),
    };
  }

  /**
   * Adapt a Request and Response into a ViewerResponseEvent.
   */
  toViewerResponseEvent(
    req: Request,
    res: Response,
  ): CloudFrontFunction.ViewerResponseEvent {
    return {
      context: {
        eventType: "viewer-response",
        requestId: randomUUID(),
      },
      viewer: {
        ip: "127.0.0.1",
      },
      request: this.toCffRequest(req),
      response: this.toCffResponse(res),
    };
  }

  /**
   * Adapt a viewer-request CFF result into a Request or Response.
   */
  fromViewerRequestResult(
    result: CloudFrontFunction.Request | CloudFrontFunction.Response,
    originalReq: Request,
  ): Request | Response {
    if (this.isCffResponse(result)) {
      return this.fromCffResponse(result);
    }

    return this.fromCffRequest(result, originalReq);
  }

  /**
   * Adapt a viewer-response CFF result into a Response.
   */
  fromViewerResponseResult(result: CloudFrontFunction.Response): Response {
    return this.fromCffResponse(result);
  }

  private toCffRequest(req: Request): CloudFrontFunction.Request {
    const url = new URL(req.url);

    return {
      method: req.method,
      uri: url.pathname,
      headers: this.toCffHeaders(req.headers),
      querystring: this.toCffQueryString(url.searchParams),
      cookies: this.toCffCookies(req.headers),
    };
  }

  private toCffResponse(res: Response): CloudFrontFunction.Response {
    return {
      statusCode: res.status,
      statusDescription: res.statusText,
      headers: this.toCffHeaders(res.headers),
    };
  }

  private fromCffRequest(
    cffReq: CloudFrontFunction.Request,
    originalReq: Request,
  ): Request {
    const url = new URL(originalReq.url);
    url.pathname = cffReq.uri;
    url.search = this.fromCffQueryString(cffReq.querystring);

    return new Request(url, {
      method: cffReq.method,
      headers: this.fromCffHeaders(cffReq.headers, cffReq.cookies),
      body: originalReq.body,
      redirect: originalReq.redirect,
      signal: originalReq.signal,
    });
  }

  private fromCffResponse(cffRes: CloudFrontFunction.Response): Response {
    return new Response(this.cffResponseBody(cffRes), {
      status: cffRes.statusCode,
      statusText: cffRes.statusDescription ?? "",
      headers: this.fromCffHeaders(cffRes.headers, {}),
    });
  }

  private cffResponseBody(cffRes: CloudFrontFunction.Response): string | null {
    if (cffRes.body === undefined) {
      return null;
    }
    if (cffRes.bodyEncoding === "base64") {
      return Buffer.from(cffRes.body, "base64").toString("utf8");
    }
    return cffRes.body;
  }

  private toCffHeaders(headers: Headers): CloudFrontFunction.Headers {
    const cffHeaders: CloudFrontFunction.Headers = {};

    for (const [name, value] of headers.entries()) {
      cffHeaders[name.toLowerCase()] = { value };
    }

    return cffHeaders;
  }

  private fromCffHeaders(
    headers: CloudFrontFunction.Headers,
    cookies: CloudFrontFunction.Cookies,
  ): Headers {
    const nativeHeaders = new Headers();

    for (const [name, { value }] of Object.entries(headers)) {
      nativeHeaders.set(name, value);
    }

    const cookieHeader = this.fromCffCookies(cookies);
    if (cookieHeader !== undefined) {
      nativeHeaders.set("cookie", cookieHeader);
    }

    return nativeHeaders;
  }

  private toCffQueryString(
    searchParams: URLSearchParams,
  ): CloudFrontFunction.QueryString {
    const queryString: CloudFrontFunction.QueryString = {};

    for (const key of new Set(searchParams.keys())) {
      const values = searchParams.getAll(key).map((value) => ({ value }));

      if (values[0] !== undefined) {
        // eslint-disable-next-line security/detect-object-injection
        queryString[key] = values[0];
        if (values.length > 1) {
          // Multi-value: first value as `value`, all values in `multiValue`
          // eslint-disable-next-line security/detect-object-injection
          queryString[key] = {
            value: values[0].value,
            multiValue: values,
          };
        }
      }
    }

    return queryString;
  }

  private fromCffQueryString(
    querystring: CloudFrontFunction.QueryString,
  ): string {
    const searchParams = new URLSearchParams();

    for (const [key, valueOrMultiValue] of Object.entries(querystring)) {
      if ("multiValue" in valueOrMultiValue) {
        for (const { value } of valueOrMultiValue.multiValue) {
          searchParams.append(key, value);
        }
      } else {
        searchParams.append(key, valueOrMultiValue.value);
      }
    }

    return searchParams.toString();
  }

  private toCffCookies(headers: Headers): CloudFrontFunction.Cookies {
    const cookieHeader = headers.get("cookie");
    if (cookieHeader === null) {
      return {};
    }

    const cookies: CloudFrontFunction.Cookies = {};

    for (const cookiePair of cookieHeader.split(";")) {
      const [rawName, ...rawValueParts] = cookiePair.trim().split("=");
      const name = rawName?.trim();

      if (name === undefined || name === "") {
        continue;
      }
      // eslint-disable-next-line security/detect-object-injection
      cookies[name] = {
        value: rawValueParts.join("=").trim(),
      };
    }

    return cookies;
  }

  private fromCffCookies(
    cookies: CloudFrontFunction.Cookies,
  ): string | undefined {
    const cookiePairs = Object.entries(cookies).map(
      ([name, { value }]) => `${name}=${value}`,
    );

    return cookiePairs.length === 0 ? undefined : cookiePairs.join("; ");
  }

  private isCffResponse(
    result: CloudFrontFunction.Request | CloudFrontFunction.Response,
  ): result is CloudFrontFunction.Response {
    return "statusCode" in result;
  }
}
