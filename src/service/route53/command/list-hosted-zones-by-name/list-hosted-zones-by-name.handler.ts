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
} from "./list-hosted-zones-by-name.command.js";
import { getHostedZoneListPage } from "./list-hosted-zones-by-name.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { ListHostedZonesByNameAuthorizer } from "./list-hosted-zones-by-name-authorizer.js";

interface ListHostedZonesByNameCommandHandlerProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListHostedZonesByNameCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: ListHostedZonesByNameAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListHostedZonesByNameCommandHandlerProperties) {
    const {
      hostedZones,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.hostedZones = hostedZones;
    this.authorizer = new ListHostedZonesByNameAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Handle listing Route53 Hosted Zones by name.
   *
   * Authorization applies to the complete operation. A denied caller receives
   * AccessDenied rather than an empty or filtered listing.
   */
  async handle(
    command: SimListHostedZonesByNameCommand,
    options?: ListHostedZonesByNameCommandHandlerOptions,
  ): Promise<SimListHostedZonesByNameCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(options?.caller);

    const page = getHostedZoneListPage({
      hostedZones: this.hostedZones,
      maxItemsInput: command.input.MaxItems,
      markerNameInput: command.input.DNSName,
      markerHostedZoneId: command.input.HostedZoneId,
    });

    return {
      HostedZones: page.hostedZones,
      DNSName: command.input.DNSName,
      HostedZoneId: command.input.HostedZoneId,
      IsTruncated: page.nextEntry !== undefined,
      NextDNSName: page.nextEntry?.hostedZone.name,
      NextHostedZoneId: page.nextEntry?.hostedZone.id,
      MaxItems: page.maxItems,
      $metadata: {},
    };
  }
}
