import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimKmsKeyResolver } from "../kms/registry/sim-kms-registry.js";
import { ChangeResourceRecordSetsCommandHandler } from "./command/change-resource-record-sets/change-resource-record-sets.handler.js";
import { CreateHostedZoneCommandHandler } from "./command/create-hosted-zone/create-hosted-zone.handler.js";
import type { SimRoute53HostedZoneId } from "./command/create-hosted-zone/sim-route53-zone-id.js";
import { DeleteHostedZoneCommandHandler } from "./command/delete-hosted-zone/delete-hosted-zone.handler.js";
import { SimRoute53DnssecCommands } from "./command/dnssec/sim-route53-dnssec-commands.js";
import { GetHostedZoneCommandHandler } from "./command/get-hosted-zone/get-hosted-zone.handler.js";
import { ListHostedZonesByNameCommandHandler } from "./command/list-hosted-zones-by-name/list-hosted-zones-by-name.handler.js";
import { ListResourceRecordSetsCommandHandler } from "./command/list-resource-record-sets/list-resource-record-sets.handler.js";
import type { SimRoute53HostedZone } from "./hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53Registry } from "./registry/sim-route53-registry.js";

interface SimRoute53CommandsProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly route53Registry: SimRoute53Registry;
  readonly kmsKeys?: SimKmsKeyResolver | undefined;
}

/**
 * The command handlers of one simulated Route53, and the state they share.
 *
 * Every handler works on the same hosted zone map, authorizes against the same
 * IAM and sequences through the same background scheduler, so the wiring lives
 * here rather than being repeated once per command in the service facade. That
 * keeps SimRoute53 what it should be: state plus delegation.
 */
export class SimRoute53Commands {
  public readonly createHostedZone: CreateHostedZoneCommandHandler;
  public readonly getHostedZone: GetHostedZoneCommandHandler;
  public readonly deleteHostedZone: DeleteHostedZoneCommandHandler;
  public readonly listHostedZonesByName: ListHostedZonesByNameCommandHandler;
  public readonly listResourceRecordSets: ListResourceRecordSetsCommandHandler;
  public readonly changeResourceRecordSets: ChangeResourceRecordSetsCommandHandler;
  public readonly dnssec: SimRoute53DnssecCommands;

  constructor(properties: SimRoute53CommandsProperties) {
    const { hostedZones, iam, background, route53Registry } = properties;

    this.createHostedZone = new CreateHostedZoneCommandHandler({
      hostedZones,
      iam,
      background,
      route53Registry,
    });
    this.getHostedZone = new GetHostedZoneCommandHandler({
      hostedZones,
      iam,
      background,
    });
    this.deleteHostedZone = new DeleteHostedZoneCommandHandler({
      hostedZones,
      route53Registry,
      iam,
      background,
    });
    this.listHostedZonesByName = new ListHostedZonesByNameCommandHandler({
      hostedZones,
      iam,
      background,
    });
    this.listResourceRecordSets = new ListResourceRecordSetsCommandHandler({
      hostedZones,
      iam,
      background,
    });
    this.changeResourceRecordSets = new ChangeResourceRecordSetsCommandHandler({
      hostedZones,
      iam,
      background,
    });
    this.dnssec = new SimRoute53DnssecCommands({
      hostedZones,
      iam,
      background,
      kmsKeys: properties.kmsKeys,
    });
  }
}
