import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";

/**
 * Converts request metadata between Fetch API and CloudFront Function shapes.
 */
export class SimCffRequestMetadataAdapter {
  /**
   * Convert Node fetch Headers to CFF Headers.
   */
  toCffHeaders(headers: Headers): CloudFrontFunction.Headers {
    const cffHeaders: CloudFrontFunction.Headers = {};

    for (const [name, value] of headers.entries()) {
      cffHeaders[name.toLowerCase()] = { value };
    }

    return cffHeaders;
  }

  /**
   * Convert CFF Headers to Node fetch Headers.
   */
  fromCffHeaders(
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

  /**
   * Convert Node URL search params to CFF QueryString.
   */
  toCffQueryString(
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

  /**
   * Convert CFF QueryString to Node URL search params.
   */
  fromCffQueryString(querystring: CloudFrontFunction.QueryString): string {
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

  /**
   * Extract CFF Cookies from Node fetch Headers.
   */
  toCffCookies(headers: Headers): CloudFrontFunction.Cookies {
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
}
