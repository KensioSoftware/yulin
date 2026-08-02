import {
  assertFalse,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../service/aws/sim-aws.js";
import { simCognitoSignedInFactory } from "../../service/cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { SimJwtKeys } from "./sim-jwt-keys.js";
import { SimJwtRs256 } from "./sim-jwt-rs256.js";
import { SimJwt } from "./sim-jwt.js";

describe("Verifying the RS256 signature of a JWT", () => {
  it("verifies a token against the key its issuer published", async () => {
    // Given a real signed token from a simulated Cognito user pool
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const jwt = SimJwt.parse(signedIn.accessToken);

    // When the key the token names is taken from the published JWKS
    const key = new SimJwtKeys(signedIn.jwks.keys).find(jwt.header.kid);

    // Then the signature is a real RS256 signature by that key
    assertNonNullable(key);
    assertTrue(new SimJwtRs256().isSupportedAlgorithm(jwt));
    assertTrue(new SimJwtRs256().verify(jwt, key));
  });

  it("refuses a token whose payload was changed after signing", async () => {
    // Given a token from a pool, with its claims rewritten and re-encoded
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const [header = "", , signature = ""] = signedIn.accessToken.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "someone-else" }),
      "utf8",
    ).toString("base64url");

    // When the forged token is verified against the same key
    const forged = SimJwt.parse(`${header}.${forgedPayload}.${signature}`);
    const key = new SimJwtKeys(signedIn.jwks.keys).find(forged.header.kid);

    // Then the signature no longer covers what the token says
    assertNonNullable(key);
    assertFalse(new SimJwtRs256().verify(forged, key));
  });

  it("refuses a token signed by another issuer's key", async () => {
    // Given two pools, each with its own signing key
    const simAws = new SimAws();
    const ours = await simCognitoSignedInFactory.make({}, simAws);
    const theirs = await simCognitoSignedInFactory.make(
      { poolName: "other-users" },
      simAws,
    );

    // When our token is checked against their published key
    const jwt = SimJwt.parse(ours.accessToken);
    const [theirKey] = theirs.jwks.keys;

    // Then it does not verify, which is what keeps one pool's tokens out of
    // another pool's API
    assertNonNullable(theirKey);
    assertFalse(new SimJwtRs256().verify(jwt, theirKey));
  });

  it("finds no key for an unknown or absent kid", () => {
    // Given a published key set
    const keys = new SimJwtKeys([
      { kty: "RSA", kid: "key-1", n: "AQAB", e: "AQAB" },
    ]);

    // Then a token naming another key, or naming none, matches nothing
    assertUndefined(keys.find("key-2"));
    assertUndefined(keys.find(undefined));
  });

  it("refuses a published key that cannot be read", () => {
    // Given a JWK of the wrong key type, and an RSA one whose modulus is not a
    // modulus
    const jwt = SimJwt.parse(
      `${Buffer.from('{"alg":"RS256"}', "utf8").toString("base64url")}.` +
        `${Buffer.from('{"sub":"u1"}', "utf8").toString("base64url")}.c2ln`,
    );

    // Then nothing verifies against either, rather than the failure reaching
    // the caller as an error about a document it did not write
    assertFalse(
      new SimJwtRs256().verify(jwt, {
        kty: "oct",
        kid: "key-1",
        n: "not-a-modulus",
        e: "AQAB",
      }),
    );
    assertFalse(
      new SimJwtRs256().verify(jwt, {
        kty: "RSA",
        kid: "key-2",
        n: "!",
        e: "AQAB",
      }),
    );
  });

  it("refuses an algorithm that is not RS256", () => {
    // Given tokens naming the two algorithms a verifier is talked out of
    // checking with
    const unsigned = SimJwt.parse(
      `${Buffer.from('{"alg":"none"}', "utf8").toString("base64url")}.` +
        `${Buffer.from('{"sub":"u1"}', "utf8").toString("base64url")}.c2ln`,
    );
    const symmetric = SimJwt.parse(
      `${Buffer.from('{"alg":"HS256"}', "utf8").toString("base64url")}.` +
        `${Buffer.from('{"sub":"u1"}', "utf8").toString("base64url")}.c2ln`,
    );

    // Then neither is an algorithm this verifies
    assertFalse(new SimJwtRs256().isSupportedAlgorithm(unsigned));
    assertFalse(new SimJwtRs256().isSupportedAlgorithm(symmetric));
  });
});
