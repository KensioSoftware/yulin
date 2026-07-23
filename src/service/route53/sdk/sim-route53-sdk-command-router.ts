import type {
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimChangeResourceRecordSetsCommand } from "../command/change-resource-record-sets/change-resource-record-sets.cmd.js";
import type { SimCreateHostedZoneCommand } from "../command/create-hosted-zone/create-hosted-zone.cmd.js";
import type { SimGetHostedZoneCommand } from "../command/get-hosted-zone/get-hosted-zone.cmd.js";
import type { SimListHostedZonesByNameCommand } from "../command/list-hosted-zones-by-name/list-hosted-zones-by-name.cmd.js";
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
        async (command): Promise<unknown> =>
          await simRoute53.changeResourceRecordSets(
            command as SimChangeResourceRecordSetsCommand,
          ),
      ],
      [
        "CreateHostedZoneCommand",
        async (command): Promise<unknown> =>
          await simRoute53.createHostedZone(
            command as SimCreateHostedZoneCommand,
          ),
      ],
      [
        "GetHostedZoneCommand",
        async (command): Promise<unknown> =>
          await simRoute53.getHostedZone(command as SimGetHostedZoneCommand),
      ],
      [
        "ListHostedZonesByNameCommand",
        async (command): Promise<unknown> =>
          await simRoute53.listHostedZonesByName(
            command as SimListHostedZonesByNameCommand,
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
