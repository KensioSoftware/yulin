import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import type {
  SimChangeResourceRecordSetsCommand,
  SimChangeResourceRecordSetsCommandOutput,
} from "./change-resource-record-sets.cmd.js";
import { applyChangeResourceRecordSet } from "./change-resource-record-sets.js";
import { getChangeResourceRecordSetsHostedZone } from "./change-res-rec-sets-zone.js";

interface ChangeResourceRecordSetsCommandHandlerProps {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly background?: BackgroundScheduler;
}

/**
 * Route53 ChangeResourceRecordSetsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/ChangeResourceRecordSetsCommand/
 */
export class ChangeResourceRecordSetsCommandHandler implements CommandHandler<
  SimChangeResourceRecordSetsCommand,
  SimChangeResourceRecordSetsCommandOutput
> {
  private readonly hostedZones: Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly background: BackgroundScheduler;

  constructor(props: ChangeResourceRecordSetsCommandHandlerProps) {
    const { hostedZones, background = new BackgroundTasks() } = props;
    this.hostedZones = hostedZones;
    this.background = background;
  }

  /**
   * Handle changing Route53 records in a Hosted Zone.
   */
  async handle(
    cmd: SimChangeResourceRecordSetsCommand,
  ): Promise<SimChangeResourceRecordSetsCommandOutput> {
    const hostedZoneId = normalizeSimRoute53HostedZoneId(
      cmd.input.HostedZoneId,
    );

    const changes = cmd.input.ChangeBatch?.Changes;
    assertDefined(
      changes,
      "ChangeResourceRecordSetsCommand.ChangeBatch.Changes",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const hostedZone = getChangeResourceRecordSetsHostedZone(
      this.hostedZones,
      hostedZoneId,
    );

    const submittedAt = new Date();

    for (const change of changes) {
      applyChangeResourceRecordSet(hostedZone, change);
    }

    return {
      ChangeInfo: {
        Id: `/change/${hostedZoneId}-${String(submittedAt.getTime())}`,
        Status: "INSYNC",
        SubmittedAt: submittedAt,
      },
      $metadata: {},
    };
  }
}
