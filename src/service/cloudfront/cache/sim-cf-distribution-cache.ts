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
 * Nothing expires. There is no TTL here yet, so an entry stays until something
 * removes it, and the cache policy's TTLs decide only whether a Behavior
 * caches at all.
 */
export class SimCfDistributionCache {
  private readonly entries = new Map<string, SimCfCachedResponse>();

  /**
   * The response cached under a key, or none where the cache does not hold it.
   */
  read(key: string): Response | undefined {
    const entry = this.entries.get(key);

    return entry === undefined ? undefined : cachedResponse(entry);
  }

  /**
   * Cache a response under a key, and hand back one to carry on with.
   *
   * Storing reads the response's body, which can only happen once, so the
   * response the caller continues with is built from the bytes that were
   * stored rather than being the one passed in.
   */
  async store(key: string, response: Response): Promise<Response> {
    const entry: SimCfCachedResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
      body: new Uint8Array(await response.arrayBuffer()),
    };

    this.entries.set(key, entry);

    return cachedResponse(entry);
  }
}

/**
 * Build a response from a cached one, which every read needs its own of.
 */
function cachedResponse(entry: SimCfCachedResponse): Response {
  return new Response(bodylessStatuses.has(entry.status) ? null : entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: new Headers(entry.headers.map(([name, value]) => [name, value])),
  });
}
