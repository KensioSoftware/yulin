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
import { SimRoute53CloudFormationResourceFactory } from "./cfn/sim-cfn-route53-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimRoute53Registry } from "./registry/sim-route53-registry.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";

export interface SimRoute53RequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimRoute53Props {
  readonly iam?: SimIamInterServiceAuthZ | undefined;
  readonly background?: BackgroundScheduler | undefined;
  readonly route53Registry?: SimRoute53Registry | undefined;
}

/**
 * Simulated Route53 service for Yulin-local name resolution.
 */
export class SimRoute53 {
  public readonly hostedZones = new Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >();
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;
  private readonly route53Registry: SimRoute53Registry;
  private readonly cfnFactory = new SimRoute53CloudFormationResourceFactory({
    route53: this,
  });

  private readonly resolver: SimRoute53Resolver;

  constructor(props: SimRoute53Props = {}) {
    const {
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      route53Registry = new SimRoute53Registry(),
    } = props;

    this.iam = iam;
    this.background = background;
    this.route53Registry = route53Registry;
    this.resolver = new SimRoute53Resolver({
      hostedZones: this.route53Registry.hostedZones,
    });
  }

  /**
   * Create a new simulated Route53 Hosted Zone.
   */
  async createHostedZone(
    cmd: SimCreateHostedZoneCommand,
    opts?: SimRoute53RequestOptions,
  ): Promise<SimCreateHostedZoneCommandOutput> {
    const handler = new CreateHostedZoneCommandHandler({
      hostedZones: this.hostedZones,
      iam: this.iam,
      background: this.background,
      route53Registry: this.route53Registry,
    });
    return await handler.handle(cmd, opts);
  }

  /**
   * Handle a Get Hosted Zone command from the SDK.
   */
  async getHostedZone(
    cmd: SimGetHostedZoneCommand,
    opts?: SimRoute53RequestOptions,
  ): Promise<SimGetHostedZoneCommandOutput> {
    const handler = new GetHostedZoneCommandHandler({
      hostedZones: this.hostedZones,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(cmd, opts);
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

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }
}
