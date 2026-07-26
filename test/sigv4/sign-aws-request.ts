/**
 * Signs requests with the real AWS SigV4 signer, for tests that check the
 * simulator's verification against it.
 *
 * This lives under `test/` rather than beside the code it exercises for two
 * reasons. It imports `@smithy/signature-v4` and `@aws-crypto/sha256-js`, which
 * are devDependencies: anything under `src/` that is not a `*.test.ts` file is
 * compiled into the published build, which would ship a module importing
 * packages consumers do not install. And several test files share it, so it
 * cannot simply live inside one of them, which eslint would reject anyway for
 * mixing exported helpers with top-level `describe` calls.
 *
 * `test/**` is included by tsconfig.json, so this is type-checked with
 * everything else, and excluded by tsconfig.build.json, so it never ships.
 * Vitest only collects `src/**` test files, so it is not mistaken for a suite,
 * and coverage only counts `src/**`, so it does not affect the thresholds.
 */

import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import type { HttpRequest } from "@smithy/types";

export interface SignAwsRequestCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export interface SignAwsRequestInput {
  readonly url: string;
  readonly credentials: SignAwsRequestCredentials;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly service?: string;
  readonly region?: string;
  readonly signingDate?: Date;
}

export interface SignedAwsRequest {
  readonly request: Request;
  readonly body: Uint8Array | undefined;
}

/**
 * Sign a request with the real AWS SigV4 signer, and return it as a Fetch
 * request the simulator can be asked to verify.
 *
 * Tests sign with the canonical implementation rather than with hand written
 * canonical strings, so what they prove is that the simulator agrees with the
 * signer real clients use, not that it agrees with a second copy of its own
 * reasoning.
 */
export async function signAwsRequest(
  input: SignAwsRequestInput,
): Promise<SignedAwsRequest> {
  const url = new URL(input.url);
  const method = input.method ?? "GET";
  const body = input.body;

  const signer = new SignatureV4({
    service: input.service ?? "lambda",
    region: input.region ?? "us-east-1",
    credentials: input.credentials,
    sha256: Sha256,
  });

  const signed = await signer.sign(
    {
      method,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port.length > 0 ? Number(url.port) : undefined,
      path: url.pathname,
      query: queryOf(url),
      headers: { host: url.host, ...input.headers },
      body,
    } as HttpRequest,
    input.signingDate === undefined ? {} : { signingDate: input.signingDate },
  );

  return {
    request: new Request(url, {
      method,
      headers: signed.headers,
      ...(body !== undefined && { body }),
    }),
    body: body === undefined ? undefined : new TextEncoder().encode(body),
  };
}

/**
 * Convert a URL's search parameters into the repeated-key shape the signer
 * expects.
 */
function queryOf(url: URL): Record<string, string | string[]> {
  const query = new Map<string, string | string[]>();
  const keys = new Set(url.searchParams.keys());

  for (const key of keys) {
    const values = url.searchParams.getAll(key);
    const single = values[0];

    query.set(
      key,
      values.length === 1 && single !== undefined ? single : values,
    );
  }

  return Object.fromEntries(query);
}
