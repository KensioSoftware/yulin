import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type * as simWafCommands from "../command/sim-wafv2-command.types.js";
import type { SimWafV2 } from "../sim-wafv2.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated WAFv2.
 */
export class SimWafSdkCommandRouter implements SimSdkCommandRouter {
  readonly #routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simWaf: SimWafV2) {
    this.#routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateWebACLCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.createWebAcl(
            command as simWafCommands.SimCreateWebAclCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetWebACLCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.getWebAcl(
            command as simWafCommands.SimGetWebAclCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateWebACLCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.updateWebAcl(
            command as simWafCommands.SimUpdateWebAclCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListWebACLsCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.listWebAcls(
            command as simWafCommands.SimListWebAclsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteWebACLCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.deleteWebAcl(
            command as simWafCommands.SimDeleteWebAclCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeManagedRuleGroupCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.describeManagedRuleGroup(
            command as simWafCommands.SimDescribeManagedRuleGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateIPSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.createIpSet(
            command as simWafCommands.SimCreateIpSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetIPSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.getIpSet(
            command as simWafCommands.SimGetIpSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateIPSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.updateIpSet(
            command as simWafCommands.SimUpdateIpSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListIPSetsCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.listIpSets(
            command as simWafCommands.SimListIpSetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteIPSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.deleteIpSet(
            command as simWafCommands.SimDeleteIpSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateRegexPatternSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.createRegexPatternSet(
            command as simWafCommands.SimCreateRegexPatternSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetRegexPatternSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.getRegexPatternSet(
            command as simWafCommands.SimGetRegexPatternSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateRegexPatternSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.updateRegexPatternSet(
            command as simWafCommands.SimUpdateRegexPatternSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListRegexPatternSetsCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.listRegexPatternSets(
            command as simWafCommands.SimListRegexPatternSetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRegexPatternSetCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.deleteRegexPatternSet(
            command as simWafCommands.SimDeleteRegexPatternSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "AssociateWebACLCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.associateWebAcl(
            command as simWafCommands.SimAssociateWebAclCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DisassociateWebACLCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.disassociateWebAcl(
            command as simWafCommands.SimDisassociateWebAclCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetWebACLForResourceCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.getWebAclForResource(
            command as simWafCommands.SimGetWebAclForResourceCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListResourcesForWebACLCommand",
        async (command, context): Promise<unknown> =>
          await simWaf.listResourcesForWebAcl(
            command as simWafCommands.SimListResourcesForWebAclCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated WAFv2 can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.#routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated WAFv2 supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.#routes.get(commandName);
  }
}
