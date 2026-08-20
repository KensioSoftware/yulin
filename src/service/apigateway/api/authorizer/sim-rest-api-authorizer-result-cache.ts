import type { SimRestApiAuthorization } from "./sim-rest-api-authorization.js";

/**
 * One held decision, and the instant it stops being usable.
 */
interface SimRestApiCachedResult {
  readonly authorization: SimRestApiAuthorization;
  readonly expiresAt: Date;
}

/**
 * What one held decision was made for.
 */
export interface SimRestApiCacheKey {
  /**
   * The ARN of the request the decision was made about, which is what the
   * authorizer's policy was evaluated against.
   */
  readonly methodArn: string;
  /**
   * The values the authorizer's identity sources found, in the order they were
   * configured. A `TOKEN` authorizer has one of these, and it is the token.
   */
  readonly identityValues: readonly string[];
}

/**
 * The decisions one Lambda authorizer has already made, held for as long as
 * its `AuthorizerResultTtlInSeconds` says.
 *
 * A `TOKEN` authorizer is keyed on the token it was handed and a `REQUEST`
 * authorizer on the values of its identity sources, which come to the same
 * thing here: a `TOKEN` authorizer has one identity source, and its value is
 * the token.
 *
 * The method the request was made to is part of the key as well, because what
 * is held is the decision rather than the policy it came from. That policy was
 * evaluated against one request ARN, and the admission or refusal it produced
 * says nothing about any other. An HTTP API keys on the identity source values
 * alone, and holds a route-shaped answer that carries over.
 *
 * The cache belongs to the authorizer rather than to whatever is serving,
 * because it outlives one request and one server the way the authorizer does.
 * It holds no clock of its own: the caller passes the instant it is asking
 * about, so expiry follows the simulation's clock and a test advances time
 * rather than waiting.
 */
export class SimRestApiAuthorizerResultCache {
  private readonly ttlSeconds: number;
  private readonly results = new Map<string, SimRestApiCachedResult>();

  constructor(ttlSeconds: number) {
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Whether this authorizer holds anything at all.
   *
   * A TTL of zero is what switches caching off, and is what an authorizer that
   * says nothing about it gets.
   */
  get isEnabled(): boolean {
    return this.ttlSeconds > 0;
  }

  /**
   * The decision already made for this request, if one was made and has not
   * expired.
   */
  find(key: SimRestApiCacheKey, at: Date): SimRestApiAuthorization | undefined {
    const cached = this.results.get(this.keyOf(key));

    if (cached === undefined) {
      return undefined;
    }

    if (cached.expiresAt.getTime() <= at.getTime()) {
      // Dropped rather than left to be overwritten, so an authorizer that is
      // never asked about this identity again does not hold it for ever.
      this.results.delete(this.keyOf(key));
      return undefined;
    }

    return cached.authorization;
  }

  /**
   * Hold a decision for this authorizer's TTL.
   *
   * A refusal is held the same way an admission is, which is what real API
   * Gateway does: it holds the authorizer's answer, whatever that was.
   */
  store(
    key: SimRestApiCacheKey,
    at: Date,
    authorization: SimRestApiAuthorization,
  ): void {
    if (!this.isEnabled) {
      return;
    }

    this.results.set(this.keyOf(key), {
      authorization,
      expiresAt: new Date(at.getTime() + this.ttlSeconds * 1000),
    });
  }

  /**
   * The string one decision is held under.
   *
   * The parts are JSON-encoded rather than joined, so two sets that differ
   * only in where one value ends and the next begins are different keys.
   */
  private keyOf(key: SimRestApiCacheKey): string {
    return JSON.stringify([key.methodArn, key.identityValues]);
  }
}
