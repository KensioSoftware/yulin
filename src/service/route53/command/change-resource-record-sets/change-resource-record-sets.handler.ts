import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import { simRoute53HostedZoneArn } from "../../hosted-zone/sim-route53-hosted-zone-arn.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import type {
  SimChangeResourceRecordSetsCommand,
  SimChangeResourceRecordSetsCommandOutput,
} from "./change-resource-record-sets.cmd.js";
import { getChangeResourceRecordSetsHostedZone } from "./change-res-rec-sets-zone.js";
import { scheduleChangeResourceRecordSets } from "./schedule/schedule-change-res-rec-sets.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { ChangeResourceRecordSetsAuthorizer } from "./change-resource-record-sets-authorizer.js";

interface ChangeResourceRecordSetsCommandHandlerProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ChangeResourceRecordSetsCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: ChangeResourceRecordSetsAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ChangeResourceRecordSetsCommandHandlerProperties) {
    const {
      hostedZones,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.hostedZones = hostedZones;
    this.authorizer = new ChangeResourceRecordSetsAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Handle changing Route53 records in a Hosted Zone.
   *
   * The hosted zone ID is normalized before authorization because it is the
   * resource identifier used in the IAM decision. Authorization happens before
   * the hosted zone store is read so unauthorized callers cannot learn whether
   * the requested ID exists.
   */
  async handle(
    command: SimChangeResourceRecordSetsCommand,
    options?: ChangeResourceRecordSetsCommandHandlerOptions,
  ): Promise<SimChangeResourceRecordSetsCommandOutput> {
    const hostedZoneId = normalizeSimRoute53HostedZoneId(
      command.input.HostedZoneId,
    );
    const hostedZoneArn = simRoute53HostedZoneArn(hostedZoneId);

    const changes = command.input.ChangeBatch?.Changes;
    assertDefined(
      changes,
      "ChangeResourceRecordSetsCommand.ChangeBatch.Changes",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(hostedZoneArn, options?.caller);

    const hostedZone = getChangeResourceRecordSetsHostedZone(
      this.hostedZones,
      hostedZoneId,
    );

    const submittedAt = new Date();

    await scheduleChangeResourceRecordSets(
      this.background,
      hostedZone,
      changes,
    );

    return {
      ChangeInfo: {
        Id: `/change/${hostedZoneId}-${String(submittedAt.getTime())}`,
        Status: hostedZone.status,
        SubmittedAt: submittedAt,
      },
      $metadata: {},
    };
  }
}
