import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimElbV2Action } from "../action/sim-elbv2-action.js";
import { simElbV2MatchableRequest } from "../listener/rule/match/sim-elbv2-matchable-request.js";
import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import type { SimElbV2 } from "../sim-elbv2.js";

/**
 * The action answering one request, and what it came from.
 *
 * The source is carried so a refusal can name the rule or listener holding the
 * action rather than only the action itself, which is the part a reader has to
 * go and change.
 */
export class SimElbV2MatchedAction {
  constructor(
    public readonly action: SimElbV2Action,
    public readonly source: string,
  ) {}
}

/**
 * Chooses the action a listener answers a request with.
 *
 * Rules are evaluated in priority order, lowest number first, and the first one
 * whose conditions all hold claims the request. A later rule that would also
 * have matched never sees it, which is what makes priority the thing worth
 * getting right. A request no rule claims falls through to the listener's
 * default action, which is the rule real ELB reports as `default`.
 */
export class SimElbV2RuleEvaluation {
  constructor(private readonly elbV2: SimElbV2) {}

  /**
   * The action answering one request on one listener.
   */
  actionFor(
    listener: SimElbV2Listener,
    request: Request,
  ): SimElbV2MatchedAction {
    const matchable = simElbV2MatchableRequest(request);
    const rule = this.elbV2
      .findRulesForListener(listener.arn)
      .find((candidate) => candidate.matches(matchable));

    if (rule === undefined) {
      return this.only(listener.defaultActions, `Listener ${listener.arn}`);
    }

    return this.only(rule.actions, `Rule ${rule.arn}`);
  }

  /**
   * The one action a listener or rule holds.
   */
  private only(
    actions: readonly SimElbV2Action[],
    source: string,
  ): SimElbV2MatchedAction {
    const [action] = actions;

    // A listener and a rule are each created with exactly one action, and
    // modifying either replaces the list with another one action long.
    assertDefined(action, `${source} holds no action`);

    return new SimElbV2MatchedAction(action, source);
  }
}
