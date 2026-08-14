import {
  assertArrayEquals,
  assertFalse,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCognitoOAuthSettings } from "./sim-cognito-oauth-settings.js";

interface RefusedSettings {
  readonly label: string;
  readonly input: ConstructorParameters<typeof SimCognitoOAuthSettings>[0];
  readonly says: string;
}

const refusedSettings: readonly RefusedSettings[] = [
  {
    label: "callback URLs without the authorization server on",
    input: { CallbackURLs: ["https://www.example.com/callback"] },
    says: "CallbackURLs needs AllowedOAuthFlowsUserPoolClient to be true",
  },
  {
    label: "OAuth flows without the authorization server on",
    input: { AllowedOAuthFlows: ["code"] },
    says: "AllowedOAuthFlows needs AllowedOAuthFlowsUserPoolClient",
  },
  {
    label: "scopes without the authorization server on",
    input: { AllowedOAuthScopes: ["openid"] },
    says: "AllowedOAuthScopes needs AllowedOAuthFlowsUserPoolClient",
  },
  {
    label: "sign-out URLs without the authorization server on",
    input: { LogoutURLs: ["https://www.example.com/"] },
    says: "LogoutURLs needs AllowedOAuthFlowsUserPoolClient",
  },
  {
    label: "a flow that is not an OAuth flow",
    input: {
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["password"],
    },
    says: "is not an OAuth flow",
  },
  {
    label: "the implicit grant",
    input: {
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["implicit"],
    },
    says: "'implicit' is not simulated",
  },
  {
    label: "a custom scope",
    input: {
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: ["https://api.example.com/read"],
    },
    says: "belongs to a resource server",
  },
  {
    label: "a callback URL with a fragment",
    input: {
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: ["https://www.example.com/callback#done"],
    },
    says: "an absolute URI with no fragment",
  },
  {
    label: "a callback URL that is not absolute",
    input: {
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: ["/user/callback"],
    },
    says: "an absolute URI with no fragment",
  },
  {
    label: "a callback URL over plain HTTP",
    input: {
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: ["http://www.example.com/callback"],
    },
    says: "Cognito requires HTTPS",
  },
  {
    label: "a default redirect the client did not register",
    input: {
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: ["https://www.example.com/callback"],
      DefaultRedirectURI: "https://www.example.com/elsewhere",
    },
    says: "is not one of the app client's CallbackURLs",
  },
];

describe("sim Cognito app client OAuth settings", () => {
  it("holds what an authorization code client is configured with", () => {
    // Given the settings a server-side client signing in with Google needs.
    const settings = new SimCognitoOAuthSettings({
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["code"],
      AllowedOAuthScopes: ["openid", "email"],
      CallbackURLs: [
        "https://www.example.com/user/callback",
        "myapp://signed-in",
      ],
      LogoutURLs: ["https://www.example.com/"],
      DefaultRedirectURI: "https://www.example.com/user/callback",
      SupportedIdentityProviders: ["Google"],
    });

    // Then each of the checks an authorize request makes reads them back.
    assertTrue(settings.allowsCodeGrant);
    assertTrue(settings.allowsRedirectTo("myapp://signed-in"));
    assertFalse(settings.allowsRedirectTo("https://www.example.net/"));
    assertTrue(settings.allowsSignOutTo("https://www.example.com/"));
    assertTrue(settings.allowsIdentityProvider("Google"));
    assertFalse(settings.allowsIdentityProvider("Facebook"));
  });

  it("allows a loopback callback URL without TLS", () => {
    // Given a client whose callback URL is a local one, which is what an
    // application under development uses.
    const settings = new SimCognitoOAuthSettings({
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: ["http://localhost:3000/user/callback"],
    });

    // Then it is accepted, as real Cognito accepts a loopback address.
    assertTrue(
      settings.allowsRedirectTo("http://localhost:3000/user/callback"),
    );
  });

  it("reports only the settings a request set", () => {
    // Given a client created with none of them.
    const settings = new SimCognitoOAuthSettings({});

    // Then the authorization server is reported off, and no list it gates is
    // reported at all.
    assertObjectEquals(settings.toOutput(), {
      AllowedOAuthFlowsUserPoolClient: false,
    });
    assertFalse(settings.allowsCodeGrant);
    assertArrayEquals(settings.scopes, []);
  });

  it("refuses settings real Cognito would refuse", () => {
    // Given each set of settings that could not have been used on real AWS.
    for (const refused of refusedSettings) {
      // When a client is configured with them.
      const error = assertThrowsError(() => {
        // eslint-disable-next-line no-new -- the constructor is what refuses
        new SimCognitoOAuthSettings(refused.input);
      }, refused.label);

      // Then it is refused, saying what was wrong with it.
      assertStringIncludes(error.message, refused.says);
    }
  });
});
