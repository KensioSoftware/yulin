import { SimElbV2ValueListMatcher } from "./sim-elbv2-condition-matcher.js";
import type { SimElbV2MatchableRequest } from "./sim-elbv2-matchable-request.js";
import { SimElbV2WildcardPattern } from "./sim-elbv2-wildcard-pattern.js";

/**
 * A `host-header` condition, matched against the host name a request named.
 *
 * The comparison is case insensitive, as host names are. It is still a whole
 * value comparison, so `*.example.com` matches `admin.example.com` and does not
 * match `example.com`: the pattern has a dot before the wildcard's zero
 * characters, and the bare domain has nothing there.
 */
export class SimElbV2HostHeaderMatcher extends SimElbV2ValueListMatcher {
  constructor(values: readonly string[]) {
    super(
      values.map((value) => SimElbV2WildcardPattern.caseInsensitive(value)),
    );
  }

  protected override subject(request: SimElbV2MatchableRequest): string {
    return request.host;
  }
}
