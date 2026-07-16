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
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { GetHostedZoneAuthorizer } from "./get-hosted-zone-authorizer.js";

interface GetHostedZoneCommandHandlerProps {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface GetHostedZoneCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: GetHostedZoneAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(props: GetHostedZoneCommandHandlerProps) {
    const {
      hostedZones,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;
    this.hostedZones = hostedZones;
    this.authorizer = new GetHostedZoneAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Handle getting a Route53 Hosted Zone.
   *
   * The hosted zone ID is normalized before authorization because it is the
   * resource identifier used in the IAM decision. Authorization happens before
   * the hosted zone store is read so unauthorized callers cannot learn whether
   * the requested ID exists.
   */
  async handle(
    cmd: SimGetHostedZoneCommand,
    opts?: GetHostedZoneCommandHandlerOptions,
  ): Promise<SimGetHostedZoneCommandOutput> {
    const hostedZoneId = normalizeSimRoute53HostedZoneId(cmd.input.Id);
    const hostedZoneArn = `arn:aws:route53:::hostedzone/${hostedZoneId}`;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(hostedZoneArn, opts?.caller);

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
