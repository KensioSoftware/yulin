import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimRoute53NoSuchHostedZone } from "../../error/sim-route53.error.js";
import { simRoute53HostedZoneArn } from "../../hosted-zone/sim-route53-hosted-zone-arn.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53Registry } from "../../registry/sim-route53-registry.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import { DeleteHostedZoneAuthorizer } from "./delete-hosted-zone-authorizer.js";
import type {
  SimDeleteHostedZoneCommand,
  SimDeleteHostedZoneCommandOutput,
} from "./delete-hosted-zone.command.js";

interface DeleteHostedZoneCommandHandlerProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly route53Registry: SimRoute53Registry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteHostedZoneCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Route53 DeleteHostedZoneCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/DeleteHostedZoneCommand/
 */
export class DeleteHostedZoneCommandHandler implements CommandHandler<
  SimDeleteHostedZoneCommand,
  SimDeleteHostedZoneCommandOutput
> {
  private readonly hostedZones: Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly route53Registry: SimRoute53Registry;
  private readonly authorizer: DeleteHostedZoneAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteHostedZoneCommandHandlerProperties) {
    const {
      hostedZones,
      route53Registry,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.hostedZones = hostedZones;
    this.route53Registry = route53Registry;
    this.authorizer = new DeleteHostedZoneAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Handle deleting a Route53 Hosted Zone.
   *
   * Real Route53 only deletes an empty zone, and answers HostedZoneNotEmpty
   * while any record other than the zone's own NS and SOA is left in it. A
   * simulated zone is created without those two, so any record at all counts
   * here, and the caller removes them with ChangeResourceRecordSets first.
   *
   * A signed zone is refused for the same reason: real Route53 wants DNSSEC
   * disabled before the zone goes, so the DS record at the parent stops
   * pointing at a zone that no longer exists.
   *
   * Deregistering the zone is what stops its names resolving, because DNS
   * resolution reads the cross-Account registry rather than this Account's
   * own hosted zone map.
   */
  async handle(
    command: SimDeleteHostedZoneCommand,
    options?: DeleteHostedZoneCommandHandlerOptions,
  ): Promise<SimDeleteHostedZoneCommandOutput> {
    const hostedZoneId = normalizeSimRoute53HostedZoneId(command.input.Id);
    const hostedZoneArn = simRoute53HostedZoneArn(hostedZoneId);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(hostedZoneArn, options?.caller);

    const hostedZone = this.hostedZones.get(hostedZoneId);

    if (hostedZone === undefined) {
      throw new SimRoute53NoSuchHostedZone(
        `No sim Route53 Hosted Zone with ID ${hostedZoneId}`,
      );
    }

    hostedZone.assertDeletable();
    hostedZone.dnssec.assertZoneDeletable();

    this.hostedZones.delete(hostedZoneId);
    this.route53Registry.deregisterHostedZone(hostedZoneId);

    return {
      ChangeInfo: {
        Id: `/change/${hostedZoneId}`,
        Status: "INSYNC",
        SubmittedAt: this.background.now(),
      },
      $metadata: {},
    };
  }
}
