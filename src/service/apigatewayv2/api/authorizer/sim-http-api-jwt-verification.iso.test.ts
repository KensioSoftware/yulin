/* eslint-disable @typescript-eslint/naming-convention -- JWT claim names are
   the ones RFC 7519 and Cognito define, rather than identifier names. */
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoUserPoolRegistry } from "../../../cognito/registry/sim-cognito-user-pool-registry.js";
import { simCognitoSignedInFactory } from "../../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { SimCognitoHttpApiJwtIssuerKeys } from "./sim-cognito-http-api-jwt-issuer-keys.js";
import { makeSimHttpApiAuthorizerId } from "./sim-http-api-authorizer.js";
import {
  SimHttpApiAdmitted,
  type SimHttpApiAuthorization,
  type SimHttpApiRefused,
} from "./sim-http-api-authorization.js";
import { SimHttpApiIdentitySource } from "./sim-http-api-identity-source.js";
import { SimHttpApiJwtAuthorizer } from "./sim-http-api-jwt-authorizer.js";
import { SimHttpApiJwtConfiguration } from "./sim-http-api-jwt-configuration.js";
import { SimHttpApiNoJwtIssuerKeys } from "./sim-http-api-jwt-issuer-keys.js";
import { SimHttpApiJwtVerification } from "./sim-http-api-jwt-verification.js";

const now = new Date("2026-08-02T12:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

interface Pool {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly issuerUrl: string;
  /** The registry a JWT authorizer resolves this pool's issuer through. */
  readonly registry: SimCognitoUserPoolRegistry;
  /** Sign arbitrary claims with the pool's own key. */
  readonly sign: (claims: object) => string;
}

/**
 * A pool whose key signs whatever claims a test wants to verify, which is what
 * the sign-in flows themselves cannot produce.
 */
async function pool(): Promise<Pool> {
  const simAws = new SimAws();
  const signedIn = await simCognitoSignedInFactory.make({}, simAws);
  const userPool = simAws
    .cognitoIdentityProvider()
    .userPool(signedIn.userPoolId);
  const registry = new SimCognitoUserPoolRegistry();
  registry.register(userPool);

  return {
    userPoolId: signedIn.userPoolId,
    clientId: signedIn.clientId,
    issuerUrl: signedIn.issuerUrl,
    registry,
    sign: (claims) => userPool.signingKey.sign(claims),
  };
}

/**
 * The refusal a verification answered with, so a test can read what it says.
 */
function refusalOf(authorization: SimHttpApiAuthorization): SimHttpApiRefused {
  if (authorization.admitted) {
    throw new Error("Expected the token to be refused, and it was admitted");
  }

  return authorization;
}

function authorizerFor(
  issuer: string,
  audience: string,
): SimHttpApiJwtAuthorizer {
  return new SimHttpApiJwtAuthorizer({
    authorizerId: makeSimHttpApiAuthorizerId(),
    name: "pool-authorizer",
    identitySource: SimHttpApiIdentitySource.parse(
      "$request.header.Authorization",
    ),
    jwtConfiguration: new SimHttpApiJwtConfiguration({
      issuer,
      audience: [audience],
    }),
  });
}

function verificationFor(
  registry: SimCognitoUserPoolRegistry,
): SimHttpApiJwtVerification {
  return new SimHttpApiJwtVerification({
    issuerKeys: new SimCognitoHttpApiJwtIssuerKeys({
      userPoolRegistry: registry,
    }),
    clock: new SimFixedClock(now),
  });
}

describe("Validating the claims of a token a JWT authorizer accepted", () => {
  it("accepts a token whose claims all hold", async () => {
    // Given a token from the configured issuer for the configured audience
    const { registry, clientId, issuerUrl, sign } = await pool();
    const token = sign({
      iss: issuerUrl,
      client_id: clientId,
      iat: nowSeconds - 60,
      nbf: nowSeconds - 60,
      exp: nowSeconds + 60,
    });

    // Then it is admitted
    const authorization = verificationFor(registry).verify(
      authorizerFor(issuerUrl, clientId),
      token,
    );
    assertInstanceOf(authorization, SimHttpApiAdmitted);
  });

  it("refuses a token signed with an algorithm that is not RS256", async () => {
    // Given a token whose header names a symmetric algorithm, which is how a
    // verifier that trusts the header is talked out of checking anything
    const { registry, clientId, issuerUrl } = await pool();
    const header = Buffer.from('{"alg":"HS256"}', "utf8").toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iss: issuerUrl, client_id: clientId }),
      "utf8",
    ).toString("base64url");

    // Then it is refused before any key is looked for
    const authorization = verificationFor(registry).verify(
      authorizerFor(issuerUrl, clientId),
      `${header}.${payload}.c2ln`,
    );
    assertFalse(authorization.admitted);
  });

  it("refuses a token from another issuer", async () => {
    // Given a token naming an issuer the authorizer does not trust
    const { registry, clientId, issuerUrl, sign } = await pool();
    const token = sign({
      iss: "https://accounts.example.test",
      client_id: clientId,
      exp: nowSeconds + 60,
    });

    // Then it is refused with no description, since the issuer is not the one
    // case AWS publishes a description for
    const authorization = verificationFor(registry).verify(
      authorizerFor(issuerUrl, clientId),
      token,
    );
    assertUndefined(refusalOf(authorization).errorDescription);
  });

  it("does not fall back to client_id when the token has an audience", async () => {
    // Given an access token bound to a resource server, so it carries both an
    // aud naming the resource and the client_id it was issued to
    const { registry, clientId, issuerUrl, sign } = await pool();
    const token = sign({
      iss: issuerUrl,
      aud: ["https://orders.example.test"],
      client_id: clientId,
      exp: nowSeconds + 60,
    });

    // Then it is refused rather than admitted on its client_id, which is what
    // AWS does: client_id is consulted only when there is no aud at all
    const authorization = verificationFor(registry).verify(
      authorizerFor(issuerUrl, clientId),
      token,
    );
    assertIdentical(
      refusalOf(authorization).errorDescription,
      "the token does not have a valid audience",
    );
  });

  it("refuses an audience claim of a shape it cannot read", async () => {
    // Given a token whose aud is neither a string nor a list of them
    const { registry, clientId, issuerUrl, sign } = await pool();
    const token = sign({
      iss: issuerUrl,
      aud: 7,
      client_id: clientId,
      exp: nowSeconds + 60,
    });

    // Then it claims no audience, rather than being read past to client_id
    const authorization = verificationFor(registry).verify(
      authorizerFor(issuerUrl, clientId),
      token,
    );
    assertFalse(authorization.admitted);
  });

  it("refuses a token that has expired, or has no expiry at all", async () => {
    // Given a token past its expiry, one expiring exactly now, and one with no
    // exp claim
    const { registry, clientId, issuerUrl, sign } = await pool();
    const claims = { iss: issuerUrl, client_id: clientId };
    const verification = verificationFor(registry);
    const authorizer = authorizerFor(issuerUrl, clientId);

    // Then all three are refused: the expiry is compared with no allowance for
    // skew, and a token nothing can expire is not admitted
    assertFalse(
      verification.verify(authorizer, sign({ ...claims, exp: nowSeconds - 1 }))
        .admitted,
    );
    assertFalse(
      verification.verify(authorizer, sign({ ...claims, exp: nowSeconds }))
        .admitted,
    );
    assertFalse(verification.verify(authorizer, sign(claims)).admitted);
  });

  it("refuses a token that is not valid yet, or was issued in the future", async () => {
    // Given tokens whose nbf and iat are ahead of the simulation's clock
    const { registry, clientId, issuerUrl, sign } = await pool();
    const claims = {
      iss: issuerUrl,
      client_id: clientId,
      exp: nowSeconds + 600,
    };
    const verification = verificationFor(registry);
    const authorizer = authorizerFor(issuerUrl, clientId);

    // Then each is refused
    assertFalse(
      verification.verify(authorizer, sign({ ...claims, nbf: nowSeconds + 60 }))
        .admitted,
    );
    assertFalse(
      verification.verify(authorizer, sign({ ...claims, iat: nowSeconds + 60 }))
        .admitted,
    );
  });

  it("renders claim values as strings the way real API Gateway does", async () => {
    // Given a token carrying a list claim, a number and a boolean
    const { registry, clientId, issuerUrl, sign } = await pool();
    const token = sign({
      iss: issuerUrl,
      client_id: clientId,
      exp: nowSeconds + 60,
      "cognito:groups": ["Admins", "Readers"],
      auth_time: nowSeconds,
      email_verified: true,
      address: { formatted: "1 Test Street" },
      scope: "orders.read orders.write",
    });

    // Then every value arrives as a string, with a list rendered the way Go
    // prints a slice rather than as JSON or as a comma-separated list
    const authorization = verificationFor(registry).verify(
      authorizerFor(issuerUrl, clientId),
      token,
    );
    assertInstanceOf(authorization, SimHttpApiAdmitted);
    const claims = authorization.jwt?.claims ?? {};
    assertIdentical(claims["cognito:groups"], "[Admins Readers]");
    assertIdentical(claims["auth_time"], String(nowSeconds));
    // eslint-disable-next-line no-restricted-syntax -- the expected value is the string a boolean claim renders as, not a boolean.
    assertIdentical(claims["email_verified"], "true");
    assertIdentical(claims["address"], '{"formatted":"1 Test Street"}');
    assertIdentical(
      authorization.jwt?.scopes?.join(","),
      "orders.read,orders.write",
    );
  });

  it("reads scopes from an scp claim written as a list", async () => {
    // Given a token from an issuer writing scp rather than scope
    const { registry, clientId, issuerUrl, sign } = await pool();
    const token = sign({
      iss: issuerUrl,
      client_id: clientId,
      exp: nowSeconds + 60,
      scp: ["orders.read"],
    });

    // Then the scopes are read from there
    const authorization = verificationFor(registry).verify(
      authorizerFor(issuerUrl, clientId),
      token,
    );
    assertInstanceOf(authorization, SimHttpApiAdmitted);
    assertIdentical(authorization.jwt?.scopes?.join(","), "orders.read");
  });
});

describe("Finding the keys a JWT authorizer's issuer publishes", () => {
  it("publishes nothing for an issuer this simulation does not have", async () => {
    // Given a simulated Cognito with one pool
    const { registry, userPoolId } = await pool();
    const issuerKeys = new SimCognitoHttpApiJwtIssuerKeys({
      userPoolRegistry: registry,
    });

    // Then an issuer that is not a Cognito URL, one naming a pool nothing
    // created, and one reaching a pool through another region's endpoint all
    // publish nothing, so every token claiming them is refused
    assertUndefined(
      issuerKeys.publishedBy("https://accounts.example.test").find("k"),
    );
    assertUndefined(
      issuerKeys
        .publishedBy(
          "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_nope00",
        )
        .find("k"),
    );
    assertUndefined(
      issuerKeys
        .publishedBy(
          `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}`,
        )
        .find("k"),
    );
  });

  it("publishes nothing at all for a standalone API Gateway", () => {
    // Given a simulated API Gateway with no issuers behind it
    const issuerKeys = new SimHttpApiNoJwtIssuerKeys();

    // Then every issuer publishes nothing, which keeps a JWT route closed
    assertUndefined(issuerKeys.publishedBy().find("k"));
  });
});
