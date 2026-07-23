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
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { CreateHostedZoneAuthorizer } from "./create-hosted-zone-authorizer.js";

interface CreateHostedZoneCommandHandlerProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly route53Registry?: SimRoute53Registry;
}

interface CreateHostedZoneCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: CreateHostedZoneAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly route53Registry: SimRoute53Registry;

  constructor(properties: CreateHostedZoneCommandHandlerProperties) {
    const {
      hostedZones,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      route53Registry = new SimRoute53Registry(),
    } = properties;
    this.hostedZones = hostedZones;
    this.authorizer = new CreateHostedZoneAuthorizer({ iam });
    this.background = background;
    this.route53Registry = route53Registry;
  }

  /**
   * Handle creation of a new Route53 Hosted Zone.
   *
   * Authorization precedes hosted zone creation so an unauthorized caller
   * cannot allocate hosted zone state or schedule synchronization tasks.
   */
  async handle(
    command: SimCreateHostedZoneCommand,
    options?: CreateHostedZoneCommandHandlerOptions,
  ): Promise<SimCreateHostedZoneCommandOutput> {
    const nameInput = command.input.Name;
    assertDefined(nameInput, "CreateHostedZoneCommand.Name");

    const callerReference = command.input.CallerReference;
    assertDefined(callerReference, "CreateHostedZoneCommand.CallerReference");

    const hostedZoneId = makeSimRoute53HostedZoneId(
      new Set(this.hostedZones.keys()),
    );
    const submittedAt = new Date();

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(options?.caller);

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
      config: command.input.HostedZoneConfig,
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
