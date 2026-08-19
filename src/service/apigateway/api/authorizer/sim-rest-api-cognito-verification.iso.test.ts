import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoUserPoolRegistry } from "../../../cognito/registry/sim-cognito-user-pool-registry.js";
import { simCognitoSignedInFactory } from "../../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { SimRestApiMethodScopes } from "../method/sim-rest-api-method-scopes.js";
import { SimCognitoRestApiUserPools } from "./sim-cognito-rest-api-user-pools.js";
import { makeSimRestApiAuthorizerId } from "./sim-rest-api-authorizer.js";
import { SimRestApiAdmitted } from "./sim-rest-api-authorization.js";
import { SimRestApiCognitoAuthorizer } from "./sim-rest-api-cognito-authorizer.js";
import { SimRestApiCognitoVerification } from "./sim-rest-api-cognito-verification.js";
import { SimRestApiIdentitySourceParser } from "./identity/sim-rest-api-identity-source-parser.js";
import { SimRestApiUserPoolProviders } from "./sim-rest-api-user-pool-providers.js";
import { SimRestApiNoUserPools } from "./sim-rest-api-user-pools.js";

const now = new Date("2026-08-02T12:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

/**
 * The scopes a method asks for, where a test is not about them.
 */
const noScopes = new SimRestApiMethodScopes();

interface Pool {
  readonly userPoolArn: string;
  readonly issuerUrl: string;
  /** The registry the authorizer resolves this pool's id through. */
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
    userPoolArn: signedIn.userPoolArn,
    issuerUrl: signedIn.issuerUrl,
    registry,
    sign: (claims) => userPool.signingKey.sign(claims),
  };
}

function authorizerFor(userPoolArn: string): SimRestApiCognitoAuthorizer {
  return new SimRestApiCognitoAuthorizer({
    authorizerId: makeSimRestApiAuthorizerId(),
    name: "user-pools",
    providers: SimRestApiUserPoolProviders.parse([userPoolArn]),
    identitySource: new SimRestApiIdentitySourceParser().header(
      "method.request.header.Authorization",
      "COGNITO_USER_POOLS",
    ),
  });
}

function verificationFor(
  registry: SimCognitoUserPoolRegistry,
): SimRestApiCognitoVerification {
  return new SimRestApiCognitoVerification({
    userPools: new SimCognitoRestApiUserPools({ userPoolRegistry: registry }),
    clock: new SimFixedClock(now),
  });
}

describe("Verifying a token against a REST API Cognito authorizer", () => {
  it("accepts a token the named pool signed", async () => {
    // Given a token from the pool the authorizer names
    const { registry, userPoolArn, issuerUrl, sign } = await pool();
    const token = sign({
      iss: issuerUrl,
      iat: nowSeconds - 60,
      nbf: nowSeconds - 60,
      exp: nowSeconds + 60,
    });

    // Then it is admitted
    const authorization = verificationFor(registry).verify(
      authorizerFor(userPoolArn),
      token,
      noScopes,
    );
    assertInstanceOf(authorization, SimRestApiAdmitted);
  });

  it("refuses a token signed with an algorithm that is not RS256", async () => {
    // Given a token whose header names a symmetric algorithm, which is how a
    // verifier that trusts the header is talked out of checking anything
    const { registry, userPoolArn, issuerUrl } = await pool();
    const header = Buffer.from('{"alg":"HS256"}', "utf8").toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iss: issuerUrl, exp: nowSeconds + 60 }),
      "utf8",
    ).toString("base64url");

    // Then it is refused before any key is looked for
    const authorization = verificationFor(registry).verify(
      authorizerFor(userPoolArn),
      `${header}.${payload}.c2ln`,
      noScopes,
    );
    assertFalse(authorization.admitted);
  });

  it("refuses a token the pool signed for another issuer", async () => {
    // Given a token carrying the pool's own signature and another issuer
    const { registry, userPoolArn, sign } = await pool();
    const token = sign({
      iss: "https://accounts.example.test",
      exp: nowSeconds + 60,
    });

    // Then it is refused: the issuer has to be the pool that signed it, so a
    // key reused across issuers admits nothing
    const authorization = verificationFor(registry).verify(
      authorizerFor(userPoolArn),
      token,
      noScopes,
    );
    assertFalse(authorization.admitted);
  });

  it("refuses a token that has expired, or has no expiry at all", async () => {
    // Given a token past its expiry, one expiring exactly now, and one with no
    // exp claim
    const { registry, userPoolArn, issuerUrl, sign } = await pool();
    const claims = { iss: issuerUrl };
    const verification = verificationFor(registry);
    const authorizer = authorizerFor(userPoolArn);

    // Then all three are refused: the expiry is compared with no allowance for
    // skew, and a token nothing can expire is not admitted
    assertFalse(
      verification.verify(
        authorizer,
        sign({ ...claims, exp: nowSeconds - 1 }),
        noScopes,
      ).admitted,
    );
    assertFalse(
      verification.verify(
        authorizer,
        sign({ ...claims, exp: nowSeconds }),
        noScopes,
      ).admitted,
    );
    assertFalse(
      verification.verify(authorizer, sign(claims), noScopes).admitted,
    );
  });

  it("refuses a token that is not valid yet, or was issued in the future", async () => {
    // Given tokens whose nbf and iat are ahead of the simulation's clock
    const { registry, userPoolArn, issuerUrl, sign } = await pool();
    const claims = { iss: issuerUrl, exp: nowSeconds + 600 };
    const verification = verificationFor(registry);
    const authorizer = authorizerFor(userPoolArn);

    // Then each is refused
    assertFalse(
      verification.verify(
        authorizer,
        sign({ ...claims, nbf: nowSeconds + 60 }),
        noScopes,
      ).admitted,
    );
    assertFalse(
      verification.verify(
        authorizer,
        sign({ ...claims, iat: nowSeconds + 60 }),
        noScopes,
      ).admitted,
    );
  });

  it("renders claim values as strings the way real API Gateway does", async () => {
    // Given a token carrying a list claim, a number and a boolean
    const { registry, userPoolArn, issuerUrl, sign } = await pool();
    const token = sign({
      iss: issuerUrl,
      exp: nowSeconds + 60,
      "cognito:groups": ["Admins", "Readers"],
      auth_time: nowSeconds,
      email_verified: true,
      address: { formatted: "1 Test Street" },
    });

    // Then every value arrives as a string, with a list rendered the way Go
    // prints a slice rather than as JSON or as a comma-separated list
    const authorization = verificationFor(registry).verify(
      authorizerFor(userPoolArn),
      token,
      noScopes,
    );
    assertInstanceOf(authorization, SimRestApiAdmitted);
    const claims = authorization.cognito?.claims ?? {};
    assertIdentical(claims["cognito:groups"], "[Admins Readers]");
    assertIdentical(claims["auth_time"], String(nowSeconds));
    // oxlint-disable-next-line smartass/prefer-specific-assertions -- the expected value is the string a boolean claim renders as, not a boolean.
    assertIdentical(claims["email_verified"], "true");
    assertIdentical(claims["address"], '{"formatted":"1 Test Street"}');
  });

  it("refuses every token for a standalone API Gateway", async () => {
    // Given a simulated API Gateway with no Cognito behind it
    const { userPoolArn, issuerUrl, sign } = await pool();
    const verification = new SimRestApiCognitoVerification({
      userPools: new SimRestApiNoUserPools(),
      clock: new SimFixedClock(now),
    });

    // Then a token that would otherwise be accepted is refused, which keeps a
    // method configured to be closed closed
    assertFalse(
      verification.verify(
        authorizerFor(userPoolArn),
        sign({ iss: issuerUrl, exp: nowSeconds + 60 }),
        noScopes,
      ).admitted,
    );
  });
});
