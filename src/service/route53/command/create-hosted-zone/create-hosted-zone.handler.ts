import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  SimCreateHostedZoneCommand,
  SimCreateHostedZoneCommandOutput,
} from "./create-hosted-zone.cmd.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import {
  makeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "./sim-route53-zone-id.js";
import { SimRoute53HostedZoneAlreadyExists } from "../../error/sim-route53.error.js";
import { SimRoute53Registry } from "../../registry/sim-route53-registry.js";

interface CreateHostedZoneCommandHandlerProps {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly background?: BackgroundScheduler;
  readonly route53Registry?: SimRoute53Registry;
}

/**
 * Route53 CreateHostedZoneCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/CreateHostedZoneCommand/
 */
export class CreateHostedZoneCommandHandler implements CommandHandler<
  SimCreateHostedZoneCommand,
  SimCreateHostedZoneCommandOutput
> {
  private readonly hostedZones: Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly background: BackgroundScheduler;
  private readonly route53Registry: SimRoute53Registry;

  constructor(props: CreateHostedZoneCommandHandlerProps) {
    const {
      hostedZones,
      background = new BackgroundTasks(),
      route53Registry = new SimRoute53Registry(),
    } = props;
    this.hostedZones = hostedZones;
    this.background = background;
    this.route53Registry = route53Registry;
  }

  /**
   * Handle creation of a new Route53 Hosted Zone.
   */
  async handle(
    cmd: SimCreateHostedZoneCommand,
  ): Promise<SimCreateHostedZoneCommandOutput> {
    const nameInput = cmd.input.Name;
    assertDefined(nameInput, "CreateHostedZoneCommand.Name");

    const callerReference = cmd.input.CallerReference;
    assertDefined(callerReference, "CreateHostedZoneCommand.CallerReference");

    const hostedZoneId = makeSimRoute53HostedZoneId(
      new Set(this.hostedZones.keys()),
    );
    const submittedAt = new Date();

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const existingHostedZone = this.hostedZones
      .values()
      .find((hostedZone) => hostedZone.callerReference === callerReference);
    if (existingHostedZone !== undefined) {
      throw new SimRoute53HostedZoneAlreadyExists(
        `A sim Route53 Hosted Zone with caller reference ${callerReference} already exists`,
      );
    }

    const hostedZone = new SimRoute53HostedZone({
      id: hostedZoneId,
      name: nameInput,
      callerReference,
      config: cmd.input.HostedZoneConfig,
    });

    this.hostedZones.set(hostedZoneId, hostedZone);
    this.route53Registry.registerHostedZone(hostedZoneId, hostedZone);

    // Schedule background task to complete creation of the sim Hosted Zone.
    this.background.schedule(() => hostedZone.completeSynchronization());

    return {
      HostedZone: {
        Id: hostedZone.id,
        Name: hostedZone.name,
        CallerReference: hostedZone.callerReference,
        Config: hostedZone.config,
        ResourceRecordSetCount: hostedZone.records.count,
      },
      ChangeInfo: {
        Id: `/change/${hostedZoneId}`,
        Status: hostedZone.status,
        SubmittedAt: submittedAt,
      },
      DelegationSet: {
        NameServers: [
          "ns-1.sim-aws.localhost",
          "ns-2.sim-aws.localhost",
          "ns-3.sim-aws.localhost",
          "ns-4.sim-aws.localhost",
        ],
      },
      Location: `https://route53.sim-aws.localhost/2013-04-01/hostedzone/${hostedZoneId}`,
      $metadata: {},
    };
  }
}
