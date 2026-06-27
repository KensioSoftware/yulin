import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import { SimRoute53NoSuchHostedZone } from "../../error/sim-route53.error.js";
import type {
  SimGetHostedZoneCommand,
  SimGetHostedZoneCommandOutput,
} from "./get-hosted-zone.cmd.js";

interface GetHostedZoneCommandHandlerProps {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly background?: BackgroundScheduler;
}

/**
 * Route53 GetHostedZoneCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/GetHostedZoneCommand/
 */
export class GetHostedZoneCommandHandler implements CommandHandler<
  SimGetHostedZoneCommand,
  SimGetHostedZoneCommandOutput
> {
  private readonly hostedZones: Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly background: BackgroundScheduler;

  constructor(props: GetHostedZoneCommandHandlerProps) {
    const { hostedZones, background = new BackgroundTasks() } = props;
    this.hostedZones = hostedZones;
    this.background = background;
  }

  /**
   * Handle getting a Route53 Hosted Zone.
   */
  async handle(
    cmd: SimGetHostedZoneCommand,
  ): Promise<SimGetHostedZoneCommandOutput> {
    const hostedZoneId = normalizeSimRoute53HostedZoneId(cmd.input.Id);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const hostedZone = this.hostedZones.get(hostedZoneId);
    if (hostedZone === undefined) {
      throw new SimRoute53NoSuchHostedZone(
        `No sim Route53 Hosted Zone with ID ${hostedZoneId}`,
      );
    }

    return {
      HostedZone: {
        Id: hostedZone.id,
        Name: hostedZone.name,
        CallerReference: hostedZone.callerReference,
        Config: hostedZone.config,
        ResourceRecordSetCount: hostedZone.records.count,
      },
      DelegationSet: {
        NameServers: [
          "ns-1.sim-aws.localhost",
          "ns-2.sim-aws.localhost",
          "ns-3.sim-aws.localhost",
          "ns-4.sim-aws.localhost",
        ],
      },
      $metadata: {},
    };
  }
}
