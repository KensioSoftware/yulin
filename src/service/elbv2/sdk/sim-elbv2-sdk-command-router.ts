import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type * as elbV2 from "../command/sim-elbv2-command.types.js";
import type { SimElbV2 } from "../sim-elbv2.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated ELBv2 instance.
 *
 * The table is built from one entry per operation rather than from a switch,
 * because the list only grows and a branch per operation would put the whole
 * of this file's complexity in one function.
 */
export class SimElbV2SdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simElbV2: SimElbV2) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateLoadBalancerCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.createLoadBalancer(
            command as elbV2.SimCreateLoadBalancerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeLoadBalancersCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.describeLoadBalancers(
            command as elbV2.SimDescribeLoadBalancersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteLoadBalancerCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.deleteLoadBalancer(
            command as elbV2.SimDeleteLoadBalancerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateTargetGroupCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.createTargetGroup(
            command as elbV2.SimCreateTargetGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeTargetGroupsCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.describeTargetGroups(
            command as elbV2.SimDescribeTargetGroupsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ModifyTargetGroupCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.modifyTargetGroup(
            command as elbV2.SimModifyTargetGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteTargetGroupCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.deleteTargetGroup(
            command as elbV2.SimDeleteTargetGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "RegisterTargetsCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.registerTargets(
            command as elbV2.SimRegisterTargetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeregisterTargetsCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.deregisterTargets(
            command as elbV2.SimDeregisterTargetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeTargetHealthCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.describeTargetHealth(
            command as elbV2.SimDescribeTargetHealthCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateListenerCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.createListener(
            command as elbV2.SimCreateListenerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeListenersCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.describeListeners(
            command as elbV2.SimDescribeListenersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ModifyListenerCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.modifyListener(
            command as elbV2.SimModifyListenerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteListenerCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.deleteListener(
            command as elbV2.SimDeleteListenerCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateRuleCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.createRule(
            command as elbV2.SimCreateRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeRulesCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.describeRules(
            command as elbV2.SimDescribeRulesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ModifyRuleCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.modifyRule(
            command as elbV2.SimModifyRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRuleCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.deleteRule(
            command as elbV2.SimDeleteRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SetRulePrioritiesCommand",
        async (command, context): Promise<unknown> =>
          await simElbV2.setRulePriorities(
            command as elbV2.SimSetRulePrioritiesCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated ELBv2 can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated ELBv2 supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
