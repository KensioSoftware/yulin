import type { SimAwsServiceTarget } from "../../serve/controller/sim-service-controller.js";
import { SimRoute53Resolver } from "./resolve/sim-route53-resolver.js";
import { CreateHostedZoneCommandHandler } from "./command/create-hosted-zone/create-hosted-zone.handler.js";
import type {
  SimCreateHostedZoneCommand,
  SimCreateHostedZoneCommandOutput,
} from "./command/create-hosted-zone/create-hosted-zone.command.js";
import type { SimRoute53HostedZone } from "./hosted-zone/sim-route53-hosted-zone.js";
import {
  registerSimRoute53HostedZone,
  type SimRoute53HostedZoneRegistration,
} from "./hosted-zone/register-sim-route53-hosted-zone.js";
import type { SimRoute53HostedZoneId } from "./command/create-hosted-zone/sim-route53-zone-id.js";
import type {
  SimGetHostedZoneCommand,
  SimGetHostedZoneCommandOutput,
} from "./command/get-hosted-zone/get-hosted-zone.command.js";
import { GetHostedZoneCommandHandler } from "./command/get-hosted-zone/get-hosted-zone.handler.js";
import type {
  SimDeleteHostedZoneCommand,
  SimDeleteHostedZoneCommandOutput,
} from "./command/delete-hosted-zone/delete-hosted-zone.command.js";
import { DeleteHostedZoneCommandHandler } from "./command/delete-hosted-zone/delete-hosted-zone.handler.js";
import type {
  SimListHostedZonesByNameCommand,
  SimListHostedZonesByNameCommandOutput,
} from "./command/list-hosted-zones-by-name/list-hosted-zones-by-name.command.js";
import { ListHostedZonesByNameCommandHandler } from "./command/list-hosted-zones-by-name/list-hosted-zones-by-name.handler.js";
import type {
  SimListResourceRecordSetsCommand,
  SimListResourceRecordSetsCommandOutput,
} from "./command/list-resource-record-sets/list-resource-record-sets.command.js";
import { ListResourceRecordSetsCommandHandler } from "./command/list-resource-record-sets/list-resource-record-sets.handler.js";
import type {
  SimChangeResourceRecordSetsCommand,
  SimChangeResourceRecordSetsCommandOutput,
} from "./command/change-resource-record-sets/change-resource-record-sets.command.js";
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
import { SimRoute53SdkCommandRouter } from "./sdk/sim-route53-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";

export interface SimRoute53RequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimRoute53Properties {
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
  private readonly sdkRouter = new SimRoute53SdkCommandRouter(this);

  private readonly resolver: SimRoute53Resolver;

  constructor(properties: SimRoute53Properties = {}) {
    const {
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      route53Registry = new SimRoute53Registry(),
    } = properties;

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
    command: SimCreateHostedZoneCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimCreateHostedZoneCommandOutput> {
    const handler = new CreateHostedZoneCommandHandler({
      hostedZones: this.hostedZones,
      iam: this.iam,
      background: this.background,
      route53Registry: this.route53Registry,
    });
    return await handler.handle(command, options);
  }

  /**
   * Register a Hosted Zone that already exists, with an ID of your choosing.
   *
   * `CreateHostedZone` allocates its own ID, as real Route53 does, so this is
   * the way to stand up a zone a template already names: a CDK app using
   * `HostedZone.fromLookup` bakes that zone's real ID into every RecordSet it
   * synthesizes. A registered zone answers Route53 commands and resolves
   * through simulated DNS the same as one the simulation created.
   *
   * An ID another Hosted Zone holds, or one that is not a Route53 Hosted Zone
   * ID, is refused.
   */
  registerHostedZone(
    registration: SimRoute53HostedZoneRegistration,
  ): SimRoute53HostedZone {
    return registerSimRoute53HostedZone(registration, {
      hostedZones: this.hostedZones,
      route53Registry: this.route53Registry,
    });
  }

  /**
   * Handle a Get Hosted Zone command from the SDK.
   */
  async getHostedZone(
    command: SimGetHostedZoneCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimGetHostedZoneCommandOutput> {
    const handler = new GetHostedZoneCommandHandler({
      hostedZones: this.hostedZones,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Delete Hosted Zone command from the SDK.
   */
  async deleteHostedZone(
    command: SimDeleteHostedZoneCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimDeleteHostedZoneCommandOutput> {
    const handler = new DeleteHostedZoneCommandHandler({
      hostedZones: this.hostedZones,
      route53Registry: this.route53Registry,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a List Hosted Zones By Name command from the SDK.
   */
  async listHostedZonesByName(
    command: SimListHostedZonesByNameCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimListHostedZonesByNameCommandOutput> {
    const handler = new ListHostedZonesByNameCommandHandler({
      hostedZones: this.hostedZones,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a List Resource Record Sets command from the SDK.
   */
  async listResourceRecordSets(
    command: SimListResourceRecordSetsCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimListResourceRecordSetsCommandOutput> {
    const handler = new ListResourceRecordSetsCommandHandler({
      hostedZones: this.hostedZones,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Change Resource Record Sets command from the SDK.
   */
  async changeResourceRecordSets(
    command: SimChangeResourceRecordSetsCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimChangeResourceRecordSetsCommandOutput> {
    const handler = new ChangeResourceRecordSetsCommandHandler({
      hostedZones: this.hostedZones,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Get every Hosted Zone resolvable in this simulated AWS environment.
   *
   * Route53 service instances are Account-scoped, but DNS-style resolution is
   * global, so the localhost serving layer reads zones from the shared registry
   * rather than from one Account's hosted-zone map.
   */
  resolvableHostedZones(): ReadonlyMap<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  > {
    return this.route53Registry.hostedZones;
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

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
