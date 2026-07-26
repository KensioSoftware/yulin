import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimIamSignatureDoesNotMatch } from "./error/sim-iam-sigv4.error.js";
import {
  signerEndpoint,
  simulationWithSigner,
} from "../../../../test/sigv4/sim-signer.js";

interface TamperChanges {
  readonly url?: string;
  readonly method?: string;
  readonly header?: { readonly name: string; readonly value: string };
}

/**
 * Rebuild a signed request with something about it changed, keeping the
 * signature it arrived with.
 */
function tamperWith(request: Request, changes: TamperChanges): Request {
  const headers = new Headers(request.headers);

  if (changes.header !== undefined) {
    headers.set(changes.header.name, changes.header.value);
  }

  return new Request(changes.url ?? request.url, {
    method: changes.method ?? request.method,
    headers,
  });
}

describe("A tampered SigV4 signed request", () => {
  it("rejects a changed request method", async () => {
    // Given a signed request whose method is changed in flight
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({ url: signerEndpoint, credentials });
    const tampered = tamperWith(signed.request, { method: "DELETE" });

    // When the simulator verifies it
    // Then the signature no longer reproduces
    expect(() => simAws.verifySignedRequest(tampered)).toThrow(
      SimIamSignatureDoesNotMatch,
    );
  });

  it("rejects a changed request path", async () => {
    // Given a signed request redirected to another path
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: `${signerEndpoint}orders`,
      credentials,
    });
    const tampered = tamperWith(signed.request, {
      url: `${signerEndpoint}invoices`,
    });

    // When the simulator verifies it
    // Then the canonical path no longer matches what was signed
    expect(() => simAws.verifySignedRequest(tampered)).toThrow(
      SimIamSignatureDoesNotMatch,
    );
  });

  it("rejects a changed query parameter", async () => {
    // Given a signed request whose query is edited
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: `${signerEndpoint}?amount=10`,
      credentials,
    });
    const tampered = tamperWith(signed.request, {
      url: `${signerEndpoint}?amount=1000`,
    });

    // When the simulator verifies it
    // Then the canonical query no longer matches what was signed
    expect(() => simAws.verifySignedRequest(tampered)).toThrow(
      SimIamSignatureDoesNotMatch,
    );
  });

  it("rejects a changed signed header", async () => {
    // Given a signed request whose signed header value is edited
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      headers: { "x-account": "111111111111" },
      credentials,
    });
    const tampered = tamperWith(signed.request, {
      header: { name: "x-account", value: "222222222222" },
    });

    // When the simulator verifies it
    // Then the canonical headers no longer match what was signed
    expect(() => simAws.verifySignedRequest(tampered)).toThrow(
      SimIamSignatureDoesNotMatch,
    );
  });

  it("rejects a changed request body", async () => {
    // Given a signed request whose body is swapped for another
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      method: "POST",
      body: '{"amount":10}',
      credentials,
    });
    const swapped = new TextEncoder().encode('{"amount":1000}');

    // When the simulator verifies it against the body actually received
    // Then the payload hash no longer matches what was signed
    expect(() => simAws.verifySignedRequest(signed.request, swapped)).toThrow(
      SimIamSignatureDoesNotMatch,
    );
  });

  it("rejects a request that has dropped a signed header", async () => {
    // Given a signed request arriving without one of its signed headers
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      headers: { "x-account": "111111111111" },
      credentials,
    });
    const headers = new Headers(signed.request.headers);
    headers.delete("x-account");
    const stripped = new Request(signed.request.url, { headers });

    // When the simulator verifies it
    // Then it says which signed header is missing rather than failing opaquely
    expect(() => simAws.verifySignedRequest(stripped)).toThrow(
      /signed header x-account/,
    );
  });
});
