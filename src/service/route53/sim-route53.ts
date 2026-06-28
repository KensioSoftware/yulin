import type { SimAwsServiceTarget } from "../../serve/controller/sim-service-controller.js";
import { SimRoute53Resolver } from "./resolve/sim-route53-resolver.js";
import { CreateHostedZoneCommandHandler } from "./command/create-hosted-zone/create-hosted-zone.handler.js";
import type {
  SimCreateHostedZoneCommand,
  SimCreateHostedZoneCommandOutput,
} from "./command/create-hosted-zone/create-hosted-zone.cmd.js";
import type { SimRoute53HostedZone } from "./hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53HostedZoneId } from "./command/create-hosted-zone/sim-route53-zone-id.js";
import type {
  SimGetHostedZoneCommand,
  SimGetHostedZoneCommandOutput,
} from "./command/get-hosted-zone/get-hosted-zone.cmd.js";
import { GetHostedZoneCommandHandler } from "./command/get-hosted-zone/get-hosted-zone.handler.js";
import type {
  SimListHostedZonesByNameCommand,
  SimListHostedZonesByNameCommandOutput,
} from "./command/list-hosted-zones-by-name/list-hosted-zones-by-name.cmd.js";
import { ListHostedZonesByNameCommandHandler } from "./command/list-hosted-zones-by-name/list-hosted-zones-by-name.handler.js";
import type {
  SimChangeResourceRecordSetsCommand,
  SimChangeResourceRecordSetsCommandOutput,
} from "./command/change-resource-record-sets/change-resource-record-sets.cmd.js";
import { ChangeResourceRecordSetsCommandHandler } from "./command/change-resource-record-sets/change-resource-record-sets.handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";

interface SimRoute53Props {
  readonly background?: BackgroundScheduler | undefined;
}

/**
 * Simulated Route53 service for Yulin-local name resolution.
 */
export class SimRoute53 {
  public readonly hostedZones = new Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >();
  private readonly background: BackgroundScheduler;

  private readonly resolver = new SimRoute53Resolver({
    hostedZones: this.hostedZones,
  });

  constructor(props: SimRoute53Props = {}) {
    const { background = new BackgroundTasks() } = props;

    this.background = background;
  }

  /**
   * Create a new simulated Route53 Hosted Zone.
   */
  async createHostedZone(
    cmd: SimCreateHostedZoneCommand,
  ): Promise<SimCreateHostedZoneCommandOutput> {
    const handler = new CreateHostedZoneCommandHandler({
      hostedZones: this.hostedZones,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Hosted Zone command from the SDK.
   */
  async getHostedZone(
    cmd: SimGetHostedZoneCommand,
  ): Promise<SimGetHostedZoneCommandOutput> {
    const handler = new GetHostedZoneCommandHandler({
      hostedZones: this.hostedZones,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Hosted Zones By Name command from the SDK.
   */
  async listHostedZonesByName(
    cmd: SimListHostedZonesByNameCommand,
  ): Promise<SimListHostedZonesByNameCommandOutput> {
    const handler = new ListHostedZonesByNameCommandHandler({
      hostedZones: this.hostedZones,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Change Resource Record Sets command from the SDK.
   */
  async changeResourceRecordSets(
    cmd: SimChangeResourceRecordSetsCommand,
  ): Promise<SimChangeResourceRecordSetsCommandOutput> {
    const handler = new ChangeResourceRecordSetsCommandHandler({
      hostedZones: this.hostedZones,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Resolve a Yulin-local HTTP hostname to a simulated AWS service target.
   */
  resolveHttpHost(hostname: string): SimAwsServiceTarget | undefined {
    return this.resolver.resolveHttpHost(hostname);
  }
}
