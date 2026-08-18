import { createHash } from "node:crypto";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import {
  simCognitoAuthorizationCode,
  simCognitoCallbackUrl,
  simCognitoDomainHost,
  simCognitoHosted,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";

const codeVerifier = "a-code-verifier-long-enough-to-be-one";

function hostedUrl(path: string, query = ""): string {
  return new SimAwsLocalUrl({
    input: `https://${simCognitoDomainHost}${path}${query}`,
  }).toString();
}

async function postToken(
  setUp: SimCognitoHostedSetUp,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    hostedUrl("/oauth2/token"),
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: new URLSearchParams(fields).toString(),
    },
  );
}

async function errorIn(response: Response): Promise<Record<string, string>> {
  return (await response.json()) as Record<string, string>;
}

describe("Exchanging a code at a sim Cognito token endpoint", () => {
  it("authenticates a client with a secret in a basic header", async () => {
    // Given a server-side app client, which has a secret.
    const setUp = await simCognitoHosted({ generateSecret: true });
    const code = await simCognitoAuthorizationCode(setUp);
    assertNonNullable(setUp.clientSecret);

    // When the code is exchanged with the secret in an authorization header.
    const response = await postToken(
      setUp,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: simCognitoCallbackUrl,
      },
      {
        authorization: `Basic ${Buffer.from(
          `${setUp.clientId}:${setUp.clientSecret}`,
        ).toString("base64")}`,
      },
    );

    // Then the tokens come back, and the response says a browser may read it,
    // as real Cognito's does.
    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get("access-control-allow-origin"), "*");
    assertObjectMatches(await response.json(), { token_type: "Bearer" });
  });

  it("refuses a client that authenticates with the wrong secret", async () => {
    // Given a server-side app client and a code it can exchange.
    const setUp = await simCognitoHosted({ generateSecret: true });
    const code = await simCognitoAuthorizationCode(setUp);

    // When the code is exchanged with the wrong secret.
    const response = await postToken(setUp, {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      client_secret: "not-the-secret",
      code,
      redirect_uri: simCognitoCallbackUrl,
    });

    // Then the client authentication fails rather than the grant.
    assertIdentical(response.status, 400);
    const failure = await errorIn(response);
    assertIdentical(failure["error"], "invalid_client");
  });

  it("completes a grant made with PKCE", async () => {
    // Given a sign-in that carried a PKCE challenge.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp, {
      code_challenge: createHash("sha256")
        .update(codeVerifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    });

    // When the code is exchanged with the verifier it was derived from.
    const response = await postToken(setUp, {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
      code_verifier: codeVerifier,
    });

    // Then the tokens come back.
    assertIdentical(response.status, 200);
  });

  it("refuses a grant made with PKCE and no verifier", async () => {
    // Given a sign-in that carried a PKCE challenge.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp, {
      code_challenge: createHash("sha256")
        .update(codeVerifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    });

    // When the code is exchanged without the verifier.
    const response = await postToken(setUp, {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
    });

    // Then the grant is refused, which is what PKCE is for.
    const failure = await errorIn(response);
    assertIdentical(failure["error"], "invalid_grant");
  });

  it("refuses a code that has already been exchanged", async () => {
    // Given a code that has been exchanged once.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp);
    const fields = {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
    };
    await postToken(setUp, fields);

    // When it is exchanged again.
    const response = await postToken(setUp, fields);

    // Then it is refused, because a code is single use.
    const failure = await errorIn(response);
    assertIdentical(failure["error"], "invalid_grant");
  });

  it("refuses a redirect URI that is not the one the code was issued for", async () => {
    // Given a code issued for the app client's callback URL.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp);

    // When it is exchanged naming another URL.
    const response = await postToken(setUp, {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: "https://www.example.net/callback",
    });

    // Then it is refused the way real Cognito refuses it, which says
    // `invalid_redirect` rather than naming the grant.
    const error = await errorIn(response);
    assertIdentical(error["error"], "unauthorized_client");
    assertStringIncludes(error["error_description"] ?? "", "invalid_redirect");
  });

  it("refuses a grant this endpoint does not answer", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When a client credentials grant is asked for.
    const response = await postToken(setUp, {
      grant_type: "client_credentials",
      client_id: setUp.clientId,
    });

    // Then it is refused, saying that resource servers are what it would need.
    const error = await errorIn(response);
    assertIdentical(error["error"], "unsupported_grant_type");
    assertStringIncludes(
      error["error_description"] ?? "",
      "resource servers are not simulated",
    );
  });

  it("refuses a refresh token the pool has not issued", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When a refresh token nothing issued is presented.
    const response = await postToken(setUp, {
      grant_type: "refresh_token",
      client_id: setUp.clientId,
      refresh_token: "not-a-refresh-token",
    });

    // Then it is refused.
    const failure = await errorIn(response);
    assertIdentical(failure["error"], "invalid_grant");
  });

  it("refuses an app client that is not an authorization server client", async () => {
    // Given a pool whose app client has no OAuth settings at all.
    const setUp = await simCognitoHosted();
    const plain = await setUp.cognito.createUserPoolClient({
      input: { UserPoolId: setUp.userPoolId, ClientName: "api" },
    });
    assertNonNullable(plain.UserPoolClient?.ClientId);

    // When it tries to exchange a code.
    const response = await postToken(setUp, {
      grant_type: "authorization_code",
      client_id: plain.UserPoolClient.ClientId,
      code: "any-code",
      redirect_uri: simCognitoCallbackUrl,
    });

    // Then it is refused, naming the settings that would let it.
    const error = await errorIn(response);
    assertIdentical(error["error"], "unauthorized_client");
    assertStringIncludes(
      error["error_description"] ?? "",
      "AllowedOAuthFlowsUserPoolClient",
    );
  });

  it("answers no method but POST", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When the token endpoint is fetched rather than posted to.
    const response = await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
      hostedUrl("/oauth2/token"),
    );

    // Then it says which method it answers.
    assertIdentical(response.status, 405);
    assertIdentical(response.headers.get("allow"), "POST");
  });
});
