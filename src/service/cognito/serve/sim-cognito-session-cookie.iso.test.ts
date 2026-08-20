import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  simCognitoLogoutUrl,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";

describe("The sim Cognito managed login session cookie", () => {
  /**
   * A URL on the pool's hosted domain, rewritten to the localhost form the
   * simulation serves on.
   */
  function hostedUrl(
    setUp: SimCognitoHostedSetUp,
    path: string,
    parameters: Record<string, string> = {},
  ): string {
    const query = new URLSearchParams(parameters).toString();

    return new SimAwsLocalUrl({
      input: `https://${setUp.domainHost}${path}?${query}`,
    }).toString();
  }

  /**
   * The value of a cookie in a `Set-Cookie` header.
   */
  function cookieValueIn(response: Response, name: string): string {
    const header = response.headers.get("set-cookie");
    assertNonNullable(header);
    assertStringIncludes(header, `${name}=`);

    const [pair = ""] = header.split(";", 1);

    return pair.slice(pair.indexOf("=") + 1);
  }

  it("hands the browser a cognito cookie when it signs in", async () => {
    // Given a hosted domain over a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    // When the sign-in form is posted to the authorize endpoint.
    const response = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
        username: simCognitoLocalUsername,
        password: simCognitoLocalPassword,
      }),
    );

    // Then the response carries the session cookie real managed login sets,
    // scoped to the domain and held for the hour Cognito gives one.
    assertIdentical(response.status, 302);

    const header = response.headers.get("set-cookie");
    assertNonNullable(header);
    assertStringIncludes(header, "cognito=");
    assertStringIncludes(header, "Path=/");
    assertStringIncludes(header, "HttpOnly");
    assertStringIncludes(header, "Max-Age=3600");
  });

  it("signs a browser carrying the cookie in with no credentials", async () => {
    // Given a browser that has signed in and kept its cookie.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    const signedIn = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
        username: simCognitoLocalUsername,
        password: simCognitoLocalPassword,
      }),
    );
    const session = cookieValueIn(signedIn, "cognito");

    // When the application sends it back to authorize with no credentials.
    const response = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
      }),
      { headers: { cookie: `cognito=${session}` } },
    );

    // Then it goes straight back to the callback with a code, rather than
    // being shown the sign-in form.
    assertIdentical(response.status, 302);

    const location = response.headers.get("location");
    assertNonNullable(location);
    assertNonNullable(new URL(location).searchParams.get("code"));
  });

  it("clears the cookie at the logout endpoint", async () => {
    // Given a browser signed in at the hosted domain.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    const signedIn = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
        username: simCognitoLocalUsername,
        password: simCognitoLocalPassword,
      }),
    );
    const session = cookieValueIn(signedIn, "cognito");

    // When it follows the application's sign-out to the logout endpoint.
    const signedOut = await http.fetch(
      hostedUrl(setUp, "/logout", {
        client_id: setUp.clientId,
        logout_uri: simCognitoLogoutUrl,
      }),
      { headers: { cookie: `cognito=${session}` } },
    );

    // Then the cookie is taken out of the browser.
    assertIdentical(signedOut.status, 302);

    const header = signedOut.headers.get("set-cookie");
    assertNonNullable(header);
    assertStringIncludes(header, "cognito=;");
    assertStringIncludes(header, "Max-Age=0");

    // And an authorize request still carrying the old value is answered with
    // the sign-in form rather than a code.
    const afterwards = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
      }),
      { headers: { cookie: `cognito=${session}` } },
    );

    assertIdentical(afterwards.status, 200);
    assertStringIncludes(await afterwards.text(), 'name="password"');
  });

  it("shows the form to a browser whose cookies hold no session", async () => {
    // Given a browser carrying the other cookies managed login sets and no
    // session of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    // When it arrives at the authorize endpoint.
    const response = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
      }),
      { headers: { cookie: "lang=en; XSRF-TOKEN=a1b2c3" } },
    );

    // Then it is shown the sign-in form.
    assertIdentical(response.status, 200);
    assertStringIncludes(await response.text(), 'name="password"');
  });

  it("finds the session among cookies that carry no value", async () => {
    // Given a browser signed in, whose cookie header also holds a bare flag.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    const signedIn = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
        username: simCognitoLocalUsername,
        password: simCognitoLocalPassword,
      }),
    );
    const session = cookieValueIn(signedIn, "cognito");

    // When it comes back with that flag ahead of the session.
    const response = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
      }),
      { headers: { cookie: `flag; cognito=${session}` } },
    );

    // Then the session is still read, and it signs the browser in.
    assertIdentical(response.status, 302);

    const location = response.headers.get("location");
    assertNonNullable(location);
    assertNonNullable(new URL(location).searchParams.get("code"));
  });

  it("sets no cookie on a sign-in the browser's own session answered", async () => {
    // Given a browser that has signed in and kept its cookie.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    const signedIn = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
        username: simCognitoLocalUsername,
        password: simCognitoLocalPassword,
      }),
    );
    const session = cookieValueIn(signedIn, "cognito");

    // When it signs in again from that session.
    const response = await http.fetch(
      hostedUrl(setUp, "/oauth2/authorize", {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
      }),
      { headers: { cookie: `cognito=${session}` } },
    );

    // Then nothing is set, because real Cognito leaves the hour where the
    // interactive sign-in put it.
    assertIdentical(response.headers.get("set-cookie"), null);
  });
});
