import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimElbV2UnsimulatedInputException } from "../error/sim-elbv2.error.js";
import type { SimElbV2 } from "../sim-elbv2.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";
import type { SimElbV2MatchedAction } from "./sim-elbv2-rule-evaluation.js";

/**
 * Works out which target group a `forward` action sends a request to.
 *
 * The action is stored when the listener or rule is written and performed here,
 * and the two are not the same thing: a forward this simulation cannot carry
 * out is one that was accepted and cannot serve. That is refused when the
 * request arrives rather than answered with something else, because a load
 * balancer that quietly sends a request somewhere its configuration did not say
 * is worse than one that says it cannot. What the group holds is not one of
 * those refusals: both simulated target types answer a request, in their own
 * ways.
 */
export class SimElbV2ForwardTarget {
  constructor(private readonly elbV2: SimElbV2) {}

  /**
   * The target group a matched forward action sends a request to.
   */
  resolve(matched: SimElbV2MatchedAction): SimElbV2TargetGroup {
    const { action, source } = matched;

    if (action.targetGroupArns.length > 1) {
      throw new SimElbV2UnsimulatedInputException(
        `${source} forwards to ` +
          `${String(action.targetGroupArns.length)} target groups. Weighted ` +
          `forwarding is not simulated, so which of them takes a request is ` +
          `not something this can answer.`,
      );
    }

    const [targetGroupArn] = action.targetGroupArns;

    // A forward action names a target group that exists when it is written,
    // and one anything forwards to cannot be deleted.
    assertDefined(targetGroupArn, `${source} forwards to no target group`);

    const targetGroup = this.elbV2.findTargetGroupByArn(targetGroupArn);

    assertDefined(
      targetGroup,
      `${source} forwards to the target group ${targetGroupArn}, which is ` +
        `not there`,
    );

    return targetGroup;
  }
}
