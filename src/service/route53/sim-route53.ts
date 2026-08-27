import type { SimAwsServiceHosts } from "../../serve/controller/host/sim-aws-service-hosts.js";
import type { SimAwsServiceTarget } from "../../serve/controller/sim-service-controller.js";
import { SimRoute53Resolver } from "./resolve/sim-route53-resolver.js";
import type * as simRoute53Commands from "./command/sim-route53-command.types.js";
import type { SimRoute53HostedZone } from "./hosted-zone/sim-route53-hosted-zone.js";
import {
  registerSimRoute53HostedZone,
  type SimRoute53HostedZoneRegistration,
} from "./hosted-zone/register-sim-route53-hosted-zone.js";
import type { SimRoute53HostedZoneId } from "./command/create-hosted-zone/sim-route53-zone-id.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { SimRoute53CloudFormationResourceFactory } from "./cfn/sim-cfn-route53-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimRoute53Registry } from "./registry/sim-route53-registry.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimRoute53SdkCommandRouter } from "./sdk/sim-route53-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";
import type { SimKmsKeyResolver } from "../kms/registry/sim-kms-registry.js";
import type { SimRoute53RequestOptions } from "./sim-route53-request-options.js";
import { SimRoute53Commands } from "./sim-route53-commands.js";

export type { SimRoute53RequestOptions } from "./sim-route53-request-options.js";

interface SimRoute53Properties {
  readonly iam?: SimIamInterServiceAuthZ | undefined;
  readonly background?: BackgroundScheduler | undefined;
  readonly route53Registry?: SimRoute53Registry | undefined;

  /**
   * Where a hostname a simulated resource claimed for itself is looked up,
   * such as a Cognito user pool custom domain. Resolution reaches those the
   * same way it reaches the built-in service hostnames, so a browser sent to
   * one arrives at the service holding it.
   */
  readonly serviceHosts?: SimAwsServiceHosts | undefined;

  /**
   * Where a hostname a hosted-zone record outranks is looked up, such as an
   * API Gateway custom domain, which is reached through a record on AWS. A
   * claim there answers only where no record names the hostname.
   */
  readonly shadowableServiceHosts?: SimAwsServiceHosts | undefined;

  /**
   * Where a KMS key ARN is looked up. A DNSSEC key-signing key is built on a
   * customer managed key, and Route53 checks that key before it takes one.
   */
  readonly kmsKeys?: SimKmsKeyResolver | undefined;
}

/**
 * Simulated Route53 service for Yulin-local name resolution.
 */
export class SimRoute53 {
  public readonly hostedZones = new Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >();
  private readonly route53Registry: SimRoute53Registry;
  private readonly cfnFactory = new SimRoute53CloudFormationResourceFactory({
    route53: this,
  });
  private readonly sdkRouter = new SimRoute53SdkCommandRouter(this);

  private readonly resolver: SimRoute53Resolver;
  private readonly commands: SimRoute53Commands;

  constructor(properties: SimRoute53Properties = {}) {
    const {
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      route53Registry = new SimRoute53Registry(),
    } = properties;

    this.route53Registry = route53Registry;
    this.resolver = new SimRoute53Resolver({
      hostedZones: route53Registry.hostedZones,
      serviceHosts: properties.serviceHosts,
      shadowableServiceHosts: properties.shadowableServiceHosts,
    });
    this.commands = new SimRoute53Commands({
      hostedZones: this.hostedZones,
      iam,
      background,
      route53Registry,
      kmsKeys: properties.kmsKeys,
    });
  }

  /**
   * Create a new simulated Route53 Hosted Zone.
   */
  async createHostedZone(
    command: simRoute53Commands.SimCreateHostedZoneCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimCreateHostedZoneCommandOutput> {
    return await this.commands.createHostedZone.handle(command, options);
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
    command: simRoute53Commands.SimGetHostedZoneCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimGetHostedZoneCommandOutput> {
    return await this.commands.getHostedZone.handle(command, options);
  }

  /**
   * Handle a Delete Hosted Zone command from the SDK.
   */
  async deleteHostedZone(
    command: simRoute53Commands.SimDeleteHostedZoneCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimDeleteHostedZoneCommandOutput> {
    return await this.commands.deleteHostedZone.handle(command, options);
  }

  /**
   * Handle a List Hosted Zones By Name command from the SDK.
   */
  async listHostedZonesByName(
    command: simRoute53Commands.SimListHostedZonesByNameCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimListHostedZonesByNameCommandOutput> {
    return await this.commands.listHostedZonesByName.handle(command, options);
  }

  /**
   * Handle a List Resource Record Sets command from the SDK.
   */
  async listResourceRecordSets(
    command: simRoute53Commands.SimListResourceRecordSetsCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimListResourceRecordSetsCommandOutput> {
    return await this.commands.listResourceRecordSets.handle(command, options);
  }

  /**
   * Handle a Change Resource Record Sets command from the SDK.
   */
  async changeResourceRecordSets(
    command: simRoute53Commands.SimChangeResourceRecordSetsCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimChangeResourceRecordSetsCommandOutput> {
    return await this.commands.changeResourceRecordSets.handle(
      command,
      options,
    );
  }

  /**
   * Handle a Create Key Signing Key command from the SDK.
   */
  async createKeySigningKey(
    command: simRoute53Commands.SimCreateKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimCreateKeySigningKeyCommandOutput> {
    return await this.commands.dnssec.keySigningKeys.create(command, options);
  }

  /**
   * Handle an Activate Key Signing Key command from the SDK.
   */
  async activateKeySigningKey(
    command: simRoute53Commands.SimKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimKeySigningKeyCommandOutput> {
    return await this.commands.dnssec.keySigningKeys.activate(command, options);
  }

  /**
   * Handle a Deactivate Key Signing Key command from the SDK.
   */
  async deactivateKeySigningKey(
    command: simRoute53Commands.SimKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimKeySigningKeyCommandOutput> {
    return await this.commands.dnssec.keySigningKeys.deactivate(
      command,
      options,
    );
  }

  /**
   * Handle a Delete Key Signing Key command from the SDK.
   */
  async deleteKeySigningKey(
    command: simRoute53Commands.SimKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimKeySigningKeyCommandOutput> {
    return await this.commands.dnssec.keySigningKeys.delete(command, options);
  }

  /**
   * Handle an Enable Hosted Zone DNSSEC command from the SDK.
   */
  async enableHostedZoneDnssec(
    command: simRoute53Commands.SimHostedZoneDnssecCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimHostedZoneDnssecCommandOutput> {
    return await this.commands.dnssec.zoneSigning.enable(command, options);
  }

  /**
   * Handle a Disable Hosted Zone DNSSEC command from the SDK.
   */
  async disableHostedZoneDnssec(
    command: simRoute53Commands.SimHostedZoneDnssecCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimHostedZoneDnssecCommandOutput> {
    return await this.commands.dnssec.zoneSigning.disable(command, options);
  }

  /**
   * Handle a Get DNSSEC command from the SDK.
   */
  async getDnssec(
    command: simRoute53Commands.SimGetDnssecCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<simRoute53Commands.SimGetDnssecCommandOutput> {
    return await this.commands.dnssec.zoneSigning.get(command, options);
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
