import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The origins real Cognito allows a callback URL to reach without TLS.
 */
const insecureCallbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The URLs an app client may send a browser to, checked as real Cognito checks
 * them.
 *
 * A redirect URI has to be an absolute URI with no fragment, over HTTPS unless
 * it is a loopback address, and an application's own scheme such as
 * `myapp://example` is allowed. Checking them where they are set is what stops
 * a callback URL that could never have been registered on real AWS reaching an
 * authorize request here.
 */
export class SimCognitoRedirectUrls {
  public readonly values: readonly string[];

  constructor(option: string, requested: readonly string[] | undefined) {
    this.values = [...(requested ?? [])];

    for (const value of this.values) {
      SimCognitoRedirectUrls.requireRedirect(option, value);
    }
  }

  private static requireRedirect(option: string, value: string): void {
    const url = URL.parse(value);

    if (url === null || value.includes("#")) {
      throw new SimCognitoInvalidParameterException(
        `${option} '${value}' is not a redirect URI: a redirect URI is an ` +
          `absolute URI with no fragment`,
      );
    }

    if (url.protocol === "http:" && !insecureCallbackHosts.has(url.hostname)) {
      throw new SimCognitoInvalidParameterException(
        `${option} '${value}' is not a redirect URI: Cognito requires ` +
          `HTTPS except for ${insecureCallbackHosts
            .values()
            .toArray()
            .join(", ")}`,
      );
    }
  }

  /**
   * Whether a URI is one of these, compared exactly as real Cognito compares
   * one: a URL that differs by a trailing slash is a different URL, and one
   * that matched loosely here would fail in a deployment.
   */
  includes(redirectUri: string): boolean {
    return this.values.includes(redirectUri);
  }
}
