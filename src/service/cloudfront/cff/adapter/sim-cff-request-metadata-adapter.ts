import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";

/**
 * Converts request metadata between Fetch API and CloudFront Function shapes.
 */
export class SimCffRequestMetadataAdapter {
  /**
   * Convert Node fetch Headers to CFF Headers.
   */
  toCffHeaders(headers: Headers): CloudFrontFunction.Headers {
    const cffHeaders = Object.create(null) as CloudFrontFunction.Headers;

    for (const [name, values] of this.headerValuesByName(headers)) {
      const cffValue = this.toCffValue(values);
      if (cffValue !== undefined) {
        // oxlint-disable-next-line security/detect-object-injection
        cffHeaders[name] = cffValue;
      }
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

    for (const [name, valueOrMultiValue] of Object.entries(headers)) {
      for (const value of this.fromCffValue(valueOrMultiValue)) {
        nativeHeaders.append(name, value);
      }
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
    searchParameters: URLSearchParams,
  ): CloudFrontFunction.QueryString {
    const queryString = Object.create(null) as CloudFrontFunction.QueryString;

    const searchParameterKeys = new Set(searchParameters.keys());
    for (const key of searchParameterKeys) {
      const cffValue = this.toCffValue(searchParameters.getAll(key));
      if (cffValue !== undefined) {
        // oxlint-disable-next-line security/detect-object-injection
        queryString[key] = cffValue;
      }
    }

    return queryString;
  }

  /**
   * Convert CFF QueryString to Node URL search params.
   */
  fromCffQueryString(querystring: CloudFrontFunction.QueryString): string {
    const searchParameters = new URLSearchParams();

    for (const [key, valueOrMultiValue] of Object.entries(querystring)) {
      for (const value of this.fromCffValue(valueOrMultiValue)) {
        searchParameters.append(key, value);
      }
    }

    return searchParameters.toString();
  }

  /**
   * Extract CFF Cookies from Node fetch Headers.
   */
  toCffCookies(headers: Headers): CloudFrontFunction.Cookies {
    const cookieHeader = headers.get("cookie");
    if (cookieHeader === null) {
      return {};
    }

    const cookies = Object.create(null) as CloudFrontFunction.Cookies;

    for (const cookiePair of cookieHeader.split(";")) {
      const [rawName, ...rawValueParts] = cookiePair.trim().split("=");
      const name = rawName?.trim();

      if (name === undefined || name === "") {
        continue;
      }
      // oxlint-disable-next-line security/detect-object-injection
      cookies[name] = {
        value: rawValueParts.join("=").trim(),
      };
    }

    return cookies;
  }

  /**
   * Group header values under their lowercased name.
   *
   * A `Set-Cookie` header repeated on a response is the case this exists for.
   * Node fetch Headers keep each one, and CloudFront presents a repeated
   * header as one entry holding all of its values.
   */
  private headerValuesByName(headers: Headers): Map<string, string[]> {
    const valuesByName = new Map<string, string[]>();

    for (const [name, value] of headers.entries()) {
      const headerName = name.toLowerCase();
      const values = valuesByName.get(headerName) ?? [];
      values.push(value);
      valuesByName.set(headerName, values);
    }

    return valuesByName;
  }

  /**
   * Present values in the shape CloudFront gives a repeated name.
   *
   * A single value is `value` alone. Repeated values keep the first in `value`
   * and all of them in `multiValue`. That is what a Function reads for a header
   * or a query parameter appearing more than once.
   */
  private toCffValue(
    values: readonly string[],
  ): CloudFrontFunction.Value | CloudFrontFunction.MultiValue | undefined {
    const [first] = values;
    if (first === undefined) {
      return undefined;
    }

    if (values.length === 1) {
      return { value: first };
    }

    return {
      value: first,
      multiValue: values.map((value) => ({ value })),
    };
  }

  /**
   * Read back the values a Function left under one name.
   *
   * A Function that means to send several values sets `multiValue`, and
   * CloudFront sends those in place of `value`.
   */
  private fromCffValue(
    valueOrMultiValue: CloudFrontFunction.Value | CloudFrontFunction.MultiValue,
  ): string[] {
    if ("multiValue" in valueOrMultiValue) {
      return valueOrMultiValue.multiValue.map(({ value }) => value);
    }

    return [valueOrMultiValue.value];
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
