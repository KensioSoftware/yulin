/**
 * The requests the managed login page tests share: the authorize parameters an
 * application starts a grant with, and the fetching and posting of a form.
 *
 * It lives under `test/` for the same reasons as `test/cognito/cfn-deploy.ts`:
 * a test file cannot export helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else and excluded from the
 * published build.
 */

import { assertNonNullable } from "@kensio/smartass";

import { SimAwsHttp } from "../../src/serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../src/serve/http/url/sim-aws-local-url.js";
import {
  simCognitoCallbackUrl,
  simCognitoDomainHost,
  type SimCognitoHostedSetUp,
} from "./federation-fixture.js";

/**
 * The parameters an application starts an authorization code grant with.
 */
export function simCognitoAuthorizeParameters(
  setUp: SimCognitoHostedSetUp,
): Record<string, string> {
  return {
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    scope: "openid email",
    state: "csrf-token",
  };
}

/**
 * A URL on a hosted domain, as the localhost server rewrites it.
 */
export function simCognitoPageUrl(
  path: string,
  parameters: Record<string, string> = {},
  host: string = simCognitoDomainHost,
): string {
  const query = new URLSearchParams(parameters).toString();

  return new SimAwsLocalUrl({
    input: `https://${host}${path}${query === "" ? "" : `?${query}`}`,
  }).toString();
}

/**
 * Fetch a page the way a browser follows a link to one.
 */
export async function simCognitoGetPage(
  setUp: SimCognitoHostedSetUp,
  path: string,
  parameters: Record<string, string> = {},
  host?: string,
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    simCognitoPageUrl(path, parameters, host),
  );
}

/**
 * Post a form the way a browser posts one.
 */
export async function simCognitoPostForm(
  setUp: SimCognitoHostedSetUp,
  path: string,
  fields: Record<string, string>,
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    simCognitoPageUrl(path),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    },
  );
}

/**
 * Where a redirect sent the browser.
 */
export function simCognitoRedirectedTo(response: Response): URL {
  const location = response.headers.get("location");
  assertNonNullable(location);

  return new URL(location, `https://${simCognitoDomainHost}`);
}
