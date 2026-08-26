import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { fromCffValue, toCffValue } from "./sim-cff-value.js";

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
      const cffValue = toCffValue(values);
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
      for (const value of fromCffValue(valueOrMultiValue)) {
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
   * Convert a URL query string to CFF QueryString.
   *
   * CloudFront hands a Function the names and values the viewer sent.
   * `?q=%E5%AE%B6` arrives percent-encoded, and `?q=a+b` keeps its plus.
   * Decoding here would show a Function a spelling production never produces,
   * and leave anything it writes out double-encoded.
   */
  toCffQueryString(search: string): CloudFrontFunction.QueryString {
    const querystring = Object.create(null) as CloudFrontFunction.QueryString;

    for (const [name, values] of this.rawValuesByName(search)) {
      const cffValue = toCffValue(values);
      if (cffValue !== undefined) {
        // oxlint-disable-next-line security/detect-object-injection
        querystring[name] = cffValue;
      }
    }

    return querystring;
  }

  /**
   * Convert CFF QueryString to a URL query string.
   *
   * Whatever a Function leaves behind goes to the Origin as it stands.
   * Encoding is the Function's business, the same as on CloudFront.
   */
  fromCffQueryString(querystring: CloudFrontFunction.QueryString): string {
    const pairs: string[] = [];

    for (const [name, valueOrMultiValue] of Object.entries(querystring)) {
      for (const value of fromCffValue(valueOrMultiValue)) {
        pairs.push(`${name}=${value}`);
      }
    }

    return pairs.join("&");
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
   * Group query string values under their name, both left as sent.
   *
   * A name repeated across pairs collects its values in the order they
   * appeared, and a Function reads those as `multiValue`. A pair with no `=`
   * is a name with an empty value.
   */
  private rawValuesByName(search: string): Map<string, string[]> {
    const valuesByName = new Map<string, string[]>();

    for (const pair of search.replace(/^\?/u, "").split("&")) {
      if (pair === "") {
        continue;
      }

      const separator = pair.indexOf("=");
      const name = separator === -1 ? pair : pair.slice(0, separator);
      const value = separator === -1 ? "" : pair.slice(separator + 1);

      const values = valuesByName.get(name) ?? [];
      values.push(value);
      valuesByName.set(name, values);
    }

    return valuesByName;
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

  private fromCffCookies(
    cookies: CloudFrontFunction.Cookies,
  ): string | undefined {
    const cookiePairs = Object.entries(cookies).map(
      ([name, { value }]) => `${name}=${value}`,
    );

    return cookiePairs.length === 0 ? undefined : cookiePairs.join("; ");
  }
}
