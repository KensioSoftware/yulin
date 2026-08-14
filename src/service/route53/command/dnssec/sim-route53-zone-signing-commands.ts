import type { SimRoute53RequestOptions } from "../../sim-route53-request-options.js";
import type { SimRoute53DnssecScope } from "./sim-route53-dnssec-scope.js";
import type {
  SimGetDnssecCommand,
  SimGetDnssecCommandOutput,
  SimHostedZoneDnssecCommand,
  SimHostedZoneDnssecCommandOutput,
} from "./dnssec.command.js";

interface SimRoute53ZoneSigningCommandsProperties {
  readonly scope: SimRoute53DnssecScope;
}

/**
 * The zone signing commands of one simulated Route53 scope.
 *
 * Turning signing on and off, and reporting where a zone stands, all read the
 * same DNSSEC state on the hosted zone.
 */
export class SimRoute53ZoneSigningCommands {
  private readonly scope: SimRoute53DnssecScope;

  constructor(properties: SimRoute53ZoneSigningCommandsProperties) {
    this.scope = properties.scope;
  }

  /**
   * Start signing a hosted zone.
   */
  async enable(
    command: SimHostedZoneDnssecCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimHostedZoneDnssecCommandOutput> {
    const zone = await this.scope.zoneFor(
      "route53:EnableHostedZoneDNSSEC",
      command.input.HostedZoneId,
      options,
    );

    zone.dnssec.enableSigning();

    return { $metadata: {}, ChangeInfo: this.scope.changeInfo(zone) };
  }

  /**
   * Stop signing a hosted zone, leaving its key-signing keys in place.
   */
  async disable(
    command: SimHostedZoneDnssecCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimHostedZoneDnssecCommandOutput> {
    const zone = await this.scope.zoneFor(
      "route53:DisableHostedZoneDNSSEC",
      command.input.HostedZoneId,
      options,
    );

    zone.dnssec.disableSigning();

    return { $metadata: {}, ChangeInfo: this.scope.changeInfo(zone) };
  }

  /**
   * Report a hosted zone's signing status and its key-signing keys.
   */
  async get(
    command: SimGetDnssecCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimGetDnssecCommandOutput> {
    const zone = await this.scope.zoneFor(
      "route53:GetDNSSEC",
      command.input.HostedZoneId,
      options,
    );

    return {
      $metadata: {},
      Status: { ServeSignature: zone.dnssec.serveSignature },
      KeySigningKeys: zone.dnssec.keys().map((key) => key.describe()),
    };
  }
}
