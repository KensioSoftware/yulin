import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";
import type {
  SimListHostedZonesByNameCommand,
  SimListHostedZonesByNameCommandOutput,
} from "./list-hosted-zones-by-name.cmd.js";
import { getHostedZoneListPage } from "./list-hosted-zones-by-name.js";

interface ListHostedZonesByNameCommandHandlerProps {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly background?: BackgroundScheduler;
}

/**
 * Route53 ListHostedZonesByNameCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/ListHostedZonesByNameCommand/
 */
export class ListHostedZonesByNameCommandHandler implements CommandHandler<
  SimListHostedZonesByNameCommand,
  SimListHostedZonesByNameCommandOutput
> {
  private readonly hostedZones: Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly background: BackgroundScheduler;

  constructor(props: ListHostedZonesByNameCommandHandlerProps) {
    const { hostedZones, background = new BackgroundTasks() } = props;
    this.hostedZones = hostedZones;
    this.background = background;
  }

  /**
   * Handle listing Route53 Hosted Zones by name.
   */
  async handle(
    cmd: SimListHostedZonesByNameCommand,
  ): Promise<SimListHostedZonesByNameCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const page = getHostedZoneListPage({
      hostedZones: this.hostedZones,
      maxItemsInput: cmd.input.MaxItems,
      markerNameInput: cmd.input.DNSName,
      markerHostedZoneId: cmd.input.HostedZoneId,
    });

    return {
      HostedZones: page.hostedZones,
      DNSName: cmd.input.DNSName,
      HostedZoneId: cmd.input.HostedZoneId,
      IsTruncated: page.nextEntry !== undefined,
      NextDNSName: page.nextEntry?.hostedZone.name,
      NextHostedZoneId: page.nextEntry?.hostedZone.id,
      MaxItems: String(page.maxItems),
      $metadata: {},
    };
  }
}
