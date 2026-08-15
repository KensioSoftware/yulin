import { SimElbV2ValueListMatcher } from "./sim-elbv2-condition-matcher.js";
import type { SimElbV2MatchableRequest } from "./sim-elbv2-matchable-request.js";
import { SimElbV2WildcardPattern } from "./sim-elbv2-wildcard-pattern.js";

/**
 * A `path-pattern` condition, matched against the path of the request URL.
 *
 * The comparison is case sensitive, unlike a host name's, and it is against the
 * path alone: a query string is matched by a `query-string` condition, which is
 * not simulated. The whole path has to match, so `/api/*` claims `/api/orders`
 * and does not claim `/api`.
 */
export class SimElbV2PathPatternMatcher extends SimElbV2ValueListMatcher {
  constructor(values: readonly string[]) {
    super(values.map((value) => SimElbV2WildcardPattern.caseSensitive(value)));
  }

  protected override subject(request: SimElbV2MatchableRequest): string {
    return request.path;
  }
}
