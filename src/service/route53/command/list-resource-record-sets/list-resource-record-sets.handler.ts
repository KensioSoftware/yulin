import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { findSimRoute53HostedZone } from "../../hosted-zone/find-sim-route53-hosted-zone.js";
import { simRoute53HostedZoneArn } from "../../hosted-zone/sim-route53-hosted-zone-arn.js";
import { simRoute53AbsoluteName } from "../../local-name/sim-route53-local-name.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import type {
  SimListResourceRecordSetsCommand,
  SimListResourceRecordSetsCommandOutput,
} from "./list-resource-record-sets.cmd.js";
import { getRecordSetListPage } from "./list-resource-record-sets.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { ListResourceRecordSetsAuthorizer } from "./list-resource-record-sets-authorizer.js";

interface ListResourceRecordSetsCommandHandlerProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListResourceRecordSetsCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Route53 ListResourceRecordSetsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/ListResourceRecordSetsCommand/
 */
export class ListResourceRecordSetsCommandHandler implements CommandHandler<
  SimListResourceRecordSetsCommand,
  SimListResourceRecordSetsCommandOutput
> {
  private readonly hostedZones: Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly authorizer: ListResourceRecordSetsAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListResourceRecordSetsCommandHandlerProperties) {
    const {
      hostedZones,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.hostedZones = hostedZones;
    this.authorizer = new ListResourceRecordSetsAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Handle listing the Route53 records in a Hosted Zone.
   *
   * The hosted zone ID is normalized before authorization because it is the
   * resource identifier used in the IAM decision. Authorization happens before
   * the hosted zone store is read so unauthorized callers cannot learn whether
   * the requested ID exists.
   */
  async handle(
    command: SimListResourceRecordSetsCommand,
    options?: ListResourceRecordSetsCommandHandlerOptions,
  ): Promise<SimListResourceRecordSetsCommandOutput> {
    const hostedZoneId = normalizeSimRoute53HostedZoneId(
      command.input.HostedZoneId,
    );
    const hostedZoneArn = simRoute53HostedZoneArn(hostedZoneId);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(hostedZoneArn, options?.caller);

    const hostedZone = findSimRoute53HostedZone(this.hostedZones, hostedZoneId);

    const page = getRecordSetListPage({
      hostedZone,
      maxItemsInput: command.input.MaxItems,
      startRecordName: command.input.StartRecordName,
      startRecordType: command.input.StartRecordType,
    });

    return {
      ResourceRecordSets: page.resourceRecordSets,
      IsTruncated: page.nextRecord !== undefined,
      NextRecordName: nextRecordName(page.nextRecord?.name),
      NextRecordType: page.nextRecord?.type,
      MaxItems: page.maxItems,
      $metadata: {},
    };
  }
}

function nextRecordName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }

  return simRoute53AbsoluteName(name);
}
