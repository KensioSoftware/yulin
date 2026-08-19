import { createHash } from "node:crypto";

import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
} from "../../../../test/cognito/federation-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoGetPage,
  simCognitoPostForm,
  simCognitoRedirectedTo,
} from "../../../../test/cognito/managed-login-fixture.js";

describe("The pages a sim Cognito hosted domain serves", () => {
  it("answers an authorize request with a sign-in form and its parameters", async () => {
    // Given a pool with a hosted domain and a Google provider.
    const setUp = await simCognitoHosted();

    // When the browser is sent to the authorize endpoint naming no provider.
    const response = await simCognitoGetPage(
      setUp,
      "/oauth2/authorize",
      simCognitoAuthorizeParameters(setUp),
    );

    // Then it is answered with the form, carrying the parameters the request
    // arrived on so that the post of it grants what the application asked for.
    assertIdentical(response.status, 200);
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );

    const page = await response.text();
    assertStringIncludes(page, 'name="username"');
    assertStringIncludes(page, 'name="password"');
    assertStringIncludes(page, `value="${setUp.clientId}"`);
    assertStringIncludes(page, 'name="state" value="csrf-token"');

    // And the pool's identity provider is a link to the same endpoint, so both
    // ways in are reachable from the one page.
    assertStringIncludes(page, "identity_provider=Google");
  });

  it("styles the page it serves from a stylesheet held inline", async () => {
    // Given a pool with a hosted domain.
    const setUp = await simCognitoHosted();

    // When the browser is sent to the authorize endpoint.
    const response = await simCognitoGetPage(
      setUp,
      "/oauth2/authorize",
      simCognitoAuthorizeParameters(setUp),
    );

    // Then the page carries the stylesheet itself, with the form in a card the
    // stylesheet has something to select.
    const page = await response.text();
    assertStringIncludes(page, "<style>");
    assertStringIncludes(page, "<main>");

    // And it asks for nothing else to render, because a browser fetching an
    // asset from the simulation would need a route to fetch it from.
    assertStringNotIncludes(page, "<link");
    assertStringNotIncludes(page, "<script");
  });

  it("signs a user in when the form is posted", async () => {
    // Given a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);

    // When the sign-in form is posted.
    const response = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    // Then the browser goes to the app client's callback URL with a code and
    // the state the grant started with.
    assertIdentical(response.status, 302);

    const callback = simCognitoRedirectedTo(response);
    assertIdentical(callback.origin + callback.pathname, simCognitoCallbackUrl);
    assertIdentical(callback.searchParams.get("state"), "csrf-token");
    assertNonNullable(callback.searchParams.get("code"));
  });

  it("honours a PKCE challenge the form carried", async () => {
    // Given a pool holding a confirmed user of its own, and an authorize
    // request that bound its grant to a verifier.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const challenge = {
      code_challenge: createHash("sha256")
        .update("a-code-verifier-of-a-perfectly-reasonable-length")
        .digest("base64url"),
      code_challenge_method: "S256",
    };

    // When the form served for it is posted back.
    const served = await simCognitoGetPage(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      ...challenge,
    });
    assertStringIncludes(await served.text(), challenge.code_challenge);

    const response = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      ...challenge,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    // Then the code it hands back only exchanges with the matching verifier.
    const code = simCognitoRedirectedTo(response).searchParams.get("code");
    assertNonNullable(code);

    const withoutVerifier = await simCognitoPostForm(setUp, "/oauth2/token", {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
    });

    assertIdentical(withoutVerifier.status, 400);
  });

  it("shows a wrong password on the form and issues no code", async () => {
    // Given a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);

    // When the form is posted with the wrong password.
    const response = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      password: "not-the-password",
    });

    // Then the form comes back saying so, with nowhere for a browser to take
    // a code from.
    assertIdentical(response.status, 200);
    assertStringIncludes(
      await response.text(),
      "Incorrect username or password",
    );
    assertIdentical(response.headers.get("location"), null);
  });

  it("serves all three pages through a custom domain", async () => {
    // Given a pool served on a custom domain.
    const host = "auth.example.com";
    const setUp = await simCognitoHosted({ domain: host });
    const parameters = simCognitoAuthorizeParameters(setUp);

    // When each page is fetched at that hostname.
    const pages = await Promise.all(
      ["/oauth2/authorize", "/signup", "/confirm"].map(async (path) =>
        simCognitoGetPage(setUp, path, parameters, host),
      ),
    );

    // Then each answers, so a browser in a local development server completes
    // the whole flow on the hostname the application already uses.
    for (const page of pages) {
      assertIdentical(page.status, 200);
      assertIdentical(
        page.headers.get("content-type"),
        "text/html; charset=utf-8",
      );
    }
  });

  it("writes a state back into the form without letting it change the page", async () => {
    // Given a pool with a hosted domain, and an application whose state holds
    // the characters that would otherwise end an attribute.
    const setUp = await simCognitoHosted();

    // When the sign-in form is served for it.
    const response = await simCognitoGetPage(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      state: '"><script>alert(1)</script>',
    });

    // Then the state is written back escaped, so the form still holds it and
    // the page still means what it meant.
    const page = await response.text();
    assertStringIncludes(page, "&quot;&gt;&lt;script&gt;");
    assertStringNotIncludes(page, "<script>");
  });

  it("offers only the providers the app client supports", async () => {
    // Given an app client offering the pool's own users and nothing else,
    // over a pool that has a Google provider.
    const setUp = await simCognitoHosted({ identityProviders: ["COGNITO"] });

    // When the sign-in form is served.
    const response = await simCognitoGetPage(
      setUp,
      "/oauth2/authorize",
      simCognitoAuthorizeParameters(setUp),
    );

    // Then Google is left off it, because the request that link would make is
    // one the authorize endpoint refuses.
    assertStringNotIncludes(await response.text(), "identity_provider=Google");
  });
});
