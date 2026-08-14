import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimElbV2UnsimulatedInputException } from "../error/sim-elbv2.error.js";
import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import type { SimElbV2 } from "../sim-elbv2.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";

/**
 * Works out which target group a listener's default action sends a request to.
 *
 * The action is stored when the listener is written and performed here, and the
 * two are not the same thing: a listener holding an action this simulation does
 * not carry out is a listener that was created and cannot serve. Each of those
 * is refused when the request arrives rather than answered with something else,
 * because a load balancer that silently forwards a request its configuration
 * said to redirect is worse than one that says it cannot.
 */
export class SimElbV2ForwardTarget {
  constructor(private readonly elbV2: SimElbV2) {}

  /**
   * The target group a listener's default action forwards to.
   */
  resolve(listener: SimElbV2Listener): SimElbV2TargetGroup {
    const targetGroup = this.forwardedTargetGroup(listener);

    if (targetGroup.targetType.value !== "lambda") {
      throw new SimElbV2UnsimulatedInputException(
        `Target group '${targetGroup.name}' holds ${targetGroup.targetType.value} ` +
          `targets, and only a lambda target group answers a request here. ` +
          `Nothing listens on an address in this simulation for an ip target ` +
          `to name.`,
      );
    }

    return targetGroup;
  }

  private forwardedTargetGroup(
    listener: SimElbV2Listener,
  ): SimElbV2TargetGroup {
    const [action] = listener.defaultActions;

    // A listener is created with exactly one action, so there is always one.
    assertDefined(
      action,
      `Simulated ELBv2 listener ${listener.arn} holds no default action`,
    );

    if (action.type !== "forward") {
      throw new SimElbV2UnsimulatedInputException(
        `Listener ${listener.arn} answers a request with a '${action.type}' ` +
          `action, which is stored and not yet performed. Only a forward ` +
          `action carries a request here.`,
      );
    }

    if (action.targetGroupArns.length > 1) {
      throw new SimElbV2UnsimulatedInputException(
        `Listener ${listener.arn} forwards to ` +
          `${String(action.targetGroupArns.length)} target groups. Weighted ` +
          `forwarding is not simulated, so which of them takes a request is ` +
          `not something this can answer.`,
      );
    }

    const [targetGroupArn] = action.targetGroupArns;

    // A forward action names a target group that exists when it is written,
    // and one anything forwards to cannot be deleted.
    assertDefined(
      targetGroupArn,
      `Simulated ELBv2 listener ${listener.arn} forwards to no target group`,
    );

    const targetGroup = this.elbV2.findTargetGroupByArn(targetGroupArn);

    assertDefined(
      targetGroup,
      `Simulated ELBv2 listener ${listener.arn} forwards to the target group ` +
        `${targetGroupArn}, which is not there`,
    );

    return targetGroup;
  }
}
