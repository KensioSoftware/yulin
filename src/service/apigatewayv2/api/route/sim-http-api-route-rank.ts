/**
 * The three tiers AWS documents for route selection, most specific first: a
 * route matching the whole path, a route ending in a greedy parameter, then
 * the `$default` catch-all.
 */
export const fullMatchTier = 0;
export const greedyMatchTier = 1;
export const defaultRouteTier = 2;

interface SimHttpApiRouteRankProperties {
  readonly tier: number;
  readonly methodRank: number;
  readonly segmentRanks: readonly number[];
}

/**
 * How specific one route is, and therefore which of two matching routes serves
 * a request.
 *
 * The whole precedence rule lives in `compareTo`, in the order it is applied:
 *
 * 1. The tier. AWS documents this one: a full match beats a greedy match,
 *    which beats `$default`.
 * 2. The method. An exact method beats `ANY`. Observed rather than documented,
 *    as is its place above the path comparison rather than below it.
 * 3. The path, segment by segment from the left, with a literal beating a
 *    `{name}` parameter and a `{name}` beating a `{name+}`. The first two rows
 *    of AWS's worked example give the literal-beats-parameter part. Comparing
 *    left to right rather than counting characters is what makes
 *    `GET /a/b/{c}` beat `GET /a/{b}/ccccc`, which has more literal characters
 *    and is less specific where it counts. It is also what gives the observed
 *    rule that the longest literal prefix wins between two greedy routes:
 *    `GET /pets/dog/{proxy+}` and `GET /pets/{proxy+}` differ at the second
 *    segment, where one has a literal and the other has taken everything.
 */
export class SimHttpApiRouteRank {
  public readonly tier: number;
  public readonly methodRank: number;
  public readonly segmentRanks: readonly number[];

  constructor(properties: SimHttpApiRouteRankProperties) {
    this.tier = properties.tier;
    this.methodRank = properties.methodRank;
    this.segmentRanks = properties.segmentRanks;
  }

  /**
   * Compare this rank with another, negative meaning this one is more specific
   * and therefore wins.
   */
  compareTo(other: SimHttpApiRouteRank): number {
    if (this.tier !== other.tier) {
      return this.tier - other.tier;
    }

    if (this.methodRank !== other.methodRank) {
      return this.methodRank - other.methodRank;
    }

    return this.compareSegments(other);
  }

  private compareSegments(other: SimHttpApiRouteRank): number {
    const shared = Math.min(
      this.segmentRanks.length,
      other.segmentRanks.length,
    );

    for (let index = 0; index < shared; index++) {
      const mine = this.segmentRanks.at(index) ?? 0;
      const theirs = other.segmentRanks.at(index) ?? 0;

      if (mine !== theirs) {
        return mine - theirs;
      }
    }

    /* v8 ignore next -- two routes matching one request always differ
       somewhere in the segments they share: if they did not, they would be the
       same route key, and the second is refused as a conflict */
    return 0;
  }
}
