import { describe, expect, it } from "vitest";

import { escapeSigV4Uri } from "../sigv4-uri-escape.js";
import { compareSigV4ByteOrder } from "./sigv4-byte-order.js";
import { SimIamSigV4CanonicalHeaders } from "./sim-iam-sigv4-canonical-headers.js";
import { simIamSigV4CanonicalPath } from "./sim-iam-sigv4-canonical-path.js";
import { simIamSigV4CanonicalQuery } from "./sim-iam-sigv4-canonical-query.js";
import { simIamSigV4PayloadHash } from "./sim-iam-sigv4-payload-hash.js";
import { SimIamSignatureDoesNotMatch } from "../error/sim-iam-sigv4.error.js";

describe("SigV4 URI escaping", () => {
  it("encodes everything outside the unreserved set", () => {
    // Given characters encodeURIComponent leaves alone but SigV4 does not
    // When they are escaped
    // Then they are percent-encoded, as the AWS signer encodes them
    expect(escapeSigV4Uri("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
  });

  it("leaves the unreserved set alone", () => {
    // Given only unreserved characters
    // When they are escaped
    // Then nothing changes
    expect(escapeSigV4Uri("aZ0-_.~")).toBe("aZ0-_.~");
  });
});

describe("SigV4 byte ordering", () => {
  it("orders by code unit rather than by locale", () => {
    // Given two strings a locale comparison would order the other way round
    // When they are compared
    // Then `-` sorts before `=`, which is what the signer's ordering assumes
    expect(compareSigV4ByteOrder("a-b", "a=b")).toBe(-1);
    expect(compareSigV4ByteOrder("a=b", "a-b")).toBe(1);
    expect(compareSigV4ByteOrder("same", "same")).toBe(0);
  });
});

describe("SigV4 canonical path", () => {
  it("uses a single slash for an empty path", () => {
    expect(simIamSigV4CanonicalPath("/")).toBe("/");
  });

  it("encodes the path a second time", () => {
    // Given a path whose slash is already encoded, so it is part of a segment
    // When it is canonicalized
    // Then the encoding is encoded again, keeping it distinct from a separator
    expect(simIamSigV4CanonicalPath("/orders/a%2Fb")).toBe("/orders/a%252Fb");
  });

  it("resolves dot segments before encoding", () => {
    // Given a path stepping down and back up again
    // When it is canonicalized
    // Then it names the same resource as the direct path would
    expect(simIamSigV4CanonicalPath("/a/b/../c/./d")).toBe("/a/c/d");
  });

  it("keeps a trailing slash but not an empty one", () => {
    expect(simIamSigV4CanonicalPath("/a/b/")).toBe("/a/b/");
    expect(simIamSigV4CanonicalPath("//")).toBe("/");
  });
});

describe("SigV4 canonical query", () => {
  it("orders by encoded key, then by value", () => {
    // Given keys that whole-pair sorting would order wrongly, and a repeat
    // When the query is canonicalized
    // Then keys lead the ordering and repeated values follow their own
    expect(simIamSigV4CanonicalQuery("?b=2&a-z=1&a=9&a=1")).toBe(
      "a=1&a=9&a-z=1&b=2",
    );
  });

  it("encodes keys and values, and keeps empty values", () => {
    expect(simIamSigV4CanonicalQuery("?a%20b=c%20d&empty=&flag")).toBe(
      "a%20b=c%20d&empty=&flag=",
    );
  });

  it("treats a literal plus as a plus rather than a space", () => {
    // Given a query carrying an unencoded plus, which form decoding would read
    // as a space
    // When the query is canonicalized
    // Then it is encoded as the character the client signed
    expect(simIamSigV4CanonicalQuery("?a=b+c")).toBe("a=b%2Bc");
    expect(simIamSigV4CanonicalQuery("?a=b%2Bc")).toBe("a=b%2Bc");
  });

  it("canonicalizes a part that is not validly encoded as it arrived", () => {
    // Given a percent escape that cannot be decoded
    // When the query is canonicalized
    // Then the characters actually sent are what gets signed
    expect(simIamSigV4CanonicalQuery("?a=100%25")).toBe("a=100%25");
    expect(simIamSigV4CanonicalQuery("?a=100%zz")).toBe("a=100%25zz");
  });

  it("returns nothing for a request with no query", () => {
    expect(simIamSigV4CanonicalQuery("")).toBe("");
  });

  it("leaves out the signature parameter", () => {
    // Given a presigned-style query carrying its own signature
    // When the query is canonicalized
    // Then the signature is not part of what it signs, which is also what the
    // AWS signer does for a header-signed request
    expect(simIamSigV4CanonicalQuery("?a=1&X-Amz-Signature=deadbeef")).toBe(
      "a=1",
    );
  });
});

describe("SigV4 canonical headers", () => {
  const url = new URL("https://example.on.aws/");

  it("trims and collapses whitespace in values", () => {
    const headers = new Headers({ "x-note": "  keep   me  " });
    const canonical = new SimIamSigV4CanonicalHeaders(headers, ["x-note"], url);

    expect(canonical.toString()).toBe("x-note:keep me");
  });

  it("orders signed headers and lists them", () => {
    const headers = new Headers({ "x-b": "2", "x-a": "1" });
    const canonical = new SimIamSigV4CanonicalHeaders(
      headers,
      ["x-b", "x-a"],
      url,
    );

    expect(canonical.toString()).toBe("x-a:1\nx-b:2");
    expect(canonical.signedHeaderList()).toBe("x-a;x-b");
  });

  it("takes host from the URL when the request carries no host header", () => {
    // Given a request whose host header the HTTP client owns
    const canonical = new SimIamSigV4CanonicalHeaders(
      new Headers(),
      ["host"],
      new URL("https://example.on.aws:8443/"),
    );

    // Then the URL supplies the same value the signer signed
    expect(canonical.toString()).toBe("host:example.on.aws:8443");
  });

  it("joins a repeated header with commas", () => {
    const headers = new Headers();
    headers.append("x-multi", "a");
    headers.append("x-multi", "b");

    expect(
      new SimIamSigV4CanonicalHeaders(headers, ["x-multi"], url).toString(),
    ).toBe("x-multi:a, b");
  });
});

describe("SigV4 payload hash", () => {
  it("hashes an absent body as the empty digest", () => {
    expect(simIamSigV4PayloadHash(new Headers(), undefined)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("refuses a declaration it cannot check the body against", () => {
    // Given a chunked upload's streaming marker, which is not simulated
    const headers = new Headers({
      "x-amz-content-sha256": "STREAMING-AWS4-HMAC-SHA256-PAYLOAD",
    });

    // When the hash is worked out
    // Then it is refused, rather than serving a body nothing has checked
    expect(() =>
      simIamSigV4PayloadHash(headers, new TextEncoder().encode("chunk")),
    ).toThrow(/not simulated/);
  });

  it("refuses a declaration that is neither digest nor marker", () => {
    const headers = new Headers({ "x-amz-content-sha256": "nonsense" });

    expect(() => simIamSigV4PayloadHash(headers, undefined)).toThrow(
      SimIamSignatureDoesNotMatch,
    );
  });

  it("accepts a marker that says the body is not covered", () => {
    // Given a signer declaring the payload unsigned
    const headers = new Headers({
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    });

    // When the hash is worked out for a body that does not match anything
    // Then the marker is used as it is, which is what it means
    expect(
      simIamSigV4PayloadHash(headers, new TextEncoder().encode("anything")),
    ).toBe("UNSIGNED-PAYLOAD");
  });
});
