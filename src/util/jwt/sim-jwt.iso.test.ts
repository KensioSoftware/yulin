import {
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimJwt } from "./sim-jwt.js";
import { SimJwtError } from "./sim-jwt.error.js";

/**
 * Encode one part of a token the way a JWT carries it.
 */
function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * Build a token out of a header and a payload, with a signature that is not a
 * real one: parsing does not check signatures.
 */
function token(header: object, payload: object): string {
  return `${encode(header)}.${encode(payload)}.c2lnbmF0dXJl`;
}

describe("Reading a token as a JWT", () => {
  it("reads the header, the claims and the signed bytes", () => {
    // Given a token with a header and a claim set
    const jwt = SimJwt.parse(
      token({ alg: "RS256", kid: "key-1" }, { sub: "u1", exp: 1_800_000_000 }),
    );

    // Then the header names how it was signed
    assertIdentical(jwt.header.alg, "RS256");
    assertIdentical(jwt.header.kid, "key-1");

    // And the claims are readable by name and by type
    assertIdentical(jwt.claims.text("sub"), "u1");
    assertIdentical(jwt.claims.number("exp"), 1_800_000_000);

    // And the signing input is the two encoded parts as they arrived, since
    // re-encoding the same JSON would produce different bytes
    assertIdentical(
      jwt.signingInput,
      token({ alg: "RS256", kid: "key-1" }, { sub: "u1", exp: 1_800_000_000 })
        .split(".")
        .slice(0, 2)
        .join("."),
    );
    assertIdentical(jwt.signature.toString("utf8"), "signature");
  });

  it("reads a header with no kid", () => {
    // Given a token whose issuer publishes one key and does not name it
    const jwt = SimJwt.parse(token({ alg: "RS256" }, { sub: "u1" }));

    // Then the header is read, with nothing where the key id would be
    assertIdentical(jwt.header.alg, "RS256");
    assertUndefined(jwt.header.kid);
  });

  it("refuses a token that is not three parts", () => {
    // Given tokens with too few and too many parts
    // Then each is refused as not being a JWT at all
    expect(() => SimJwt.parse("one.two")).toThrow(SimJwtError);
    expect(() => SimJwt.parse("one.two.three.four")).toThrow(
      /3 dot-separated parts/,
    );
  });

  it("refuses a token with an empty part", () => {
    // Given a token whose signature is empty, which is how an unsecured JWT is
    // written
    // Then it is refused, rather than parsed and left for a verifier to catch
    expect(() =>
      SimJwt.parse(`${encode({ alg: "none" })}.${encode({ sub: "u1" })}.`),
    ).toThrow(/no empty parts/);
  });

  it("refuses a part that is not JSON", () => {
    // Given a token whose payload does not decode to JSON
    const notJson = Buffer.from("not json", "utf8").toString("base64url");

    // Then it is refused, naming the part that could not be read
    expect(() =>
      SimJwt.parse(`${encode({ alg: "RS256" })}.${notJson}.c2ln`),
    ).toThrow(/payload is base64url-encoded JSON/);
  });

  it("refuses a part that is JSON but not an object", () => {
    // Given a token whose header is a JSON array
    const array = Buffer.from("[1,2]", "utf8").toString("base64url");

    // Then it is refused, because a JWT header is an object
    expect(() =>
      SimJwt.parse(`${array}.${encode({ sub: "u1" })}.c2ln`),
    ).toThrow(/header is a JSON object/);
  });

  it("refuses a header with no algorithm, or a kid that is not a name", () => {
    // Given headers missing alg and holding a kid of the wrong type
    // Then each is refused
    expect(() => SimJwt.parse(token({ typ: "JWT" }, { sub: "u1" }))).toThrow(
      /names its algorithm in alg/,
    );
    expect(() =>
      SimJwt.parse(token({ alg: "RS256", kid: 7 }, { sub: "u1" })),
    ).toThrow(/kid is the name of one key/);
  });
});

describe("Reading the claims of a JWT", () => {
  it("answers undefined for a claim of another type", () => {
    // Given a token whose claims are not the types they are asked for
    const jwt = SimJwt.parse(
      token({ alg: "RS256" }, { sub: 42, exp: "soon", aud: [1, 2] }),
    );

    // Then each accessor answers undefined rather than coercing or throwing,
    // so a malformed claim fails the same way a missing one does
    assertUndefined(jwt.claims.text("sub"));
    assertUndefined(jwt.claims.number("exp"));
    assertUndefined(jwt.claims.textList("aud"));
    assertUndefined(jwt.claims.textList("nothing"));
  });

  it("reads an audience written as one string or as a list", () => {
    // Given the two shapes an aud claim takes
    const one = SimJwt.parse(token({ alg: "RS256" }, { aud: "client-1" }));
    const many = SimJwt.parse(
      token({ alg: "RS256" }, { aud: ["client-1", "client-2"] }),
    );

    // Then both read as a list, which is what a verifier compares against
    assertIdentical(one.claims.textList("aud")?.join(","), "client-1");
    assertIdentical(
      many.claims.textList("aud")?.join(","),
      "client-1,client-2",
    );
  });

  it("says whether a claim is there at all", () => {
    // Given a token carrying a claim of an unexpected type
    const jwt = SimJwt.parse(token({ alg: "RS256" }, { aud: 7 }));

    // Then it is present, whatever it holds: an audience that cannot be read
    // is not the same thing as a token with no audience
    assertTrue(jwt.claims.has("aud"));
    assertFalse(jwt.claims.has("client_id"));

    // And the whole set is available for a consumer passing it on
    assertIdentical(jwt.claims.toRecord()["aud"], 7);
  });
});
