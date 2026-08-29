import { type SimClock, SimRealClock } from "../../../util/clock/sim-clock.js";
import { simCfInvalidationBatchCovers } from "../invalidation/sim-cf-invalidation-path.js";
import { simCfAgeHeaderName, simCfCacheAgeSec } from "./sim-cf-cache-status.js";
import { simCfCacheEntryKeyPath } from "./sim-cf-cache-entry-key-path.js";

/**
 * A response as a Distribution holds it, rather than as a stream something has
 * already read.
 *
 * A Response body can be read once, so what is stored is the bytes, and every
 * read builds a Response of its own from them. Two viewers served the same
 * entry therefore get a body each.
 */
interface SimCfCachedResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: Uint8Array;

  /**
   * When the entry was stored, off the simulation's clock. The `Age` header a
   * hit carries is measured from this.
   */
  readonly storedAt: Date;

  /**
   * The instant the entry stops being served. A request arriving on or after
   * it reaches the Origin.
   */
  readonly expiresAt: Date;
}

/**
 * The statuses HTTP gives no body, which a Response refuses to be built with
 * one for.
 */
const bodylessStatuses = new Set([101, 103, 204, 205, 304]);

/**
 * What one simulated Distribution has cached.
 *
 * Real CloudFront caches at each of its points of presence rather than once
 * per Distribution, which the edge in the key stands for. One cache holds an
 * entry per edge, and a request arriving at another edge misses.
 *
 * An entry leaves the cache two ways. It expires on the simulation's clock
 * rather than the host's. A test reaches the instant an object goes stale by
 * advancing simulated time, with no waiting. Or an invalidation clears it ahead
 * of that instant.
 *
 * Storing takes its seconds from the caller. An Origin's answer is held for
 * what its cache policy allows, and an error's own `ErrorCachingMinTTL` fits
 * the same call.
 */
export class SimCfDistributionCache {
  private readonly entries = new Map<string, SimCfCachedResponse>();
  private readonly clock: SimClock;

  /**
   * A cache built standalone, outside a Distribution, falls back to the real
   * clock.
   */
  constructor(clock: SimClock = new SimRealClock()) {
    this.clock = clock;
  }

  /**
   * The response cached under a key, or none where the cache does not hold it.
   *
   * An entry that has reached its expiry is dropped here. The request then goes
   * to the Origin, and what the Origin answers replaces the expired entry.
   *
   * What comes back carries `Age`, counted on the simulation's clock from the
   * instant the Origin's answer was stored. An `Age` the Origin sent is
   * replaced by the Distribution's own, as CloudFront replaces one.
   */
  read(key: string): Response | undefined {
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return undefined;
    }

    const now = this.clock.now();

    if (now.getTime() >= entry.expiresAt.getTime()) {
      this.entries.delete(key);

      return undefined;
    }

    const response = cachedResponse(entry);

    response.headers.set(
      simCfAgeHeaderName,
      String(simCfCacheAgeSec(entry.storedAt, now)),
    );

    return response;
  }

  /**
   * Cache a response under a key for a number of seconds, and hand back one to
   * carry on with.
   *
   * Storing reads the response's body, which can only happen once, so the
   * response the caller continues with is built from the bytes that were
   * stored rather than being the one passed in. A TTL of no seconds stores
   * nothing, and the response passed in is handed straight back unread.
   */
  async store(
    key: string,
    response: Response,
    ttlSec: number,
  ): Promise<Response> {
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
      return response;
    }

    const storedAt = this.clock.now();
    const entry: SimCfCachedResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
      body: new Uint8Array(await response.arrayBuffer()),
      storedAt,
      expiresAt: new Date(storedAt.getTime() + ttlSec * 1000),
    };

    this.entries.set(key, entry);

    return cachedResponse(entry);
  }

  /**
   * Forget every entry an invalidation's paths name, at every edge.
   *
   * The path an entry was cached under is read back out of its key, so
   * matching a batch costs a pass over the keys rather than a second map from
   * path to entry. Nothing here is keyed on the edge, because an invalidation
   * reaches every point of presence rather than the one a viewer happened to
   * arrive at.
   */
  clearPaths(paths: readonly string[]): void {
    for (const key of this.entries.keys()) {
      const path = simCfCacheEntryKeyPath(key);

      if (path !== undefined && simCfInvalidationBatchCovers(paths, path)) {
        this.entries.delete(key);
      }
    }
  }
}

/**
 * Build a response from a cached one, which every read needs its own of.
 *
 * No `Age` goes on here. A response on its way into the cache has been held
 * for no time at all, and only one leaving it has an age to report.
 */
function cachedResponse(entry: SimCfCachedResponse): Response {
  return new Response(bodylessStatuses.has(entry.status) ? null : entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: new Headers(entry.headers.map(([name, value]) => [name, value])),
  });
}
