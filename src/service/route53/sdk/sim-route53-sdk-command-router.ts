import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimChangeResourceRecordSetsCommand } from "../command/change-resource-record-sets/change-resource-record-sets.command.js";
import type { SimCreateHostedZoneCommand } from "../command/create-hosted-zone/create-hosted-zone.command.js";
import type { SimGetHostedZoneCommand } from "../command/get-hosted-zone/get-hosted-zone.command.js";
import type { SimListHostedZonesByNameCommand } from "../command/list-hosted-zones-by-name/list-hosted-zones-by-name.command.js";
import type { SimListResourceRecordSetsCommand } from "../command/list-resource-record-sets/list-resource-record-sets.command.js";
import type { SimRoute53 } from "../sim-route53.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Route53 instance.
 */
export class SimRoute53SdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simRoute53: SimRoute53) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "ChangeResourceRecordSetsCommand",
        async (command, context): Promise<unknown> =>
          await simRoute53.changeResourceRecordSets(
            command as SimChangeResourceRecordSetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateHostedZoneCommand",
        async (command, context): Promise<unknown> =>
          await simRoute53.createHostedZone(
            command as SimCreateHostedZoneCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetHostedZoneCommand",
        async (command, context): Promise<unknown> =>
          await simRoute53.getHostedZone(
            command as SimGetHostedZoneCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListHostedZonesByNameCommand",
        async (command, context): Promise<unknown> =>
          await simRoute53.listHostedZonesByName(
            command as SimListHostedZonesByNameCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListResourceRecordSetsCommand",
        async (command, context): Promise<unknown> =>
          await simRoute53.listResourceRecordSets(
            command as SimListResourceRecordSetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Route53 can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Route53 supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
