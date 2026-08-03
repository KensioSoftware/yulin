import type { SimHttpApiAuthorization } from "./sim-http-api-authorization.js";

/**
 * One cached decision, and the instant it stops being usable.
 */
interface SimHttpApiCachedResult {
  readonly authorization: SimHttpApiAuthorization;
  readonly expiresAt: Date;
}

/**
 * The decisions one Lambda `REQUEST` authorizer has already made, held for as
 * long as its `AuthorizerResultTtlInSeconds` says.
 *
 * Real API Gateway keys this on the values of the authorizer's identity
 * sources and nothing else, so by default one decision covers every route of
 * the API that uses the authorizer. That is the behaviour AWS warns about, and
 * `$context.routeKey` as an identity source is the documented way to put the
 * route in the key.
 *
 * The cache belongs to the authorizer rather than to whatever is serving,
 * because it outlives one request and one server the way the authorizer does.
 * It holds no clock of its own: the caller passes the instant it is asking
 * about, so expiry follows the simulation's clock and a test advances time
 * rather than waiting.
 */
export class SimHttpApiAuthorizerResultCache {
  private readonly ttlSeconds: number;
  private readonly results = new Map<string, SimHttpApiCachedResult>();

  constructor(ttlSeconds: number) {
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Whether this authorizer caches anything at all.
   *
   * A TTL of zero is what switches caching off, and is what an authorizer that
   * says nothing about it gets.
   */
  get isEnabled(): boolean {
    return this.ttlSeconds > 0;
  }

  /**
   * The decision already made for these identity source values, if one was
   * made and has not expired.
   */
  find(
    identitySource: readonly string[],
    at: Date,
  ): SimHttpApiAuthorization | undefined {
    const cached = this.results.get(this.key(identitySource));

    if (cached === undefined) {
      return undefined;
    }

    if (cached.expiresAt.getTime() <= at.getTime()) {
      // Dropped rather than left to be overwritten, so an authorizer that is
      // never called with these values again does not hold them for ever.
      this.results.delete(this.key(identitySource));
      return undefined;
    }

    return cached.authorization;
  }

  /**
   * Hold a decision for this authorizer's TTL.
   *
   * A refusal is held the same way an admission is, which is what real API
   * Gateway does: the cache holds the authorizer's answer, whatever it was.
   */
  store(
    identitySource: readonly string[],
    at: Date,
    authorization: SimHttpApiAuthorization,
  ): void {
    if (!this.isEnabled) {
      return;
    }

    this.results.set(this.key(identitySource), {
      authorization,
      expiresAt: new Date(at.getTime() + this.ttlSeconds * 1000),
    });
  }

  /**
   * The key one set of identity source values is held under.
   *
   * The values are JSON-encoded rather than joined, so two sets that differ
   * only in where one value ends and the next begins are different keys.
   */
  private key(identitySource: readonly string[]): string {
    return JSON.stringify(identitySource);
  }
}
