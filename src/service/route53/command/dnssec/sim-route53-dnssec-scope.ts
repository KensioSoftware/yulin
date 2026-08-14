import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimRoute53NoSuchHostedZone } from "../../error/sim-route53.error.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53RequestOptions } from "../../sim-route53-request-options.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53ChangeInfo } from "../create-hosted-zone/create-hosted-zone.command.js";
import { SimRoute53DnssecAuthorizer } from "./sim-route53-dnssec-authorizer.js";

interface SimRoute53DnssecScopeProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * What every DNSSEC command does before and after its own work.
 *
 * All seven start the same way: normalise the hosted zone ID, sequence through
 * the background scheduler, authorize against the zone ARN, then find the
 * zone. Doing that once here keeps each command to the part that differs.
 */
export class SimRoute53DnssecScope {
  private readonly hostedZones: Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly authorizer: SimRoute53DnssecAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimRoute53DnssecScopeProperties) {
    this.hostedZones = properties.hostedZones;
    this.authorizer = new SimRoute53DnssecAuthorizer({ iam: properties.iam });
    this.background = properties.background;
  }

  /**
   * The hosted zone a DNSSEC request names, once the caller may reach it.
   */
  async zoneFor(
    action: string,
    hostedZoneId: string | undefined,
    options?: SimRoute53RequestOptions,
  ): Promise<SimRoute53HostedZone> {
    const zoneId = normalizeSimRoute53HostedZoneId(hostedZoneId);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(action, zoneId, options?.caller);

    const hostedZone = this.hostedZones.get(zoneId);

    if (hostedZone === undefined) {
      throw new SimRoute53NoSuchHostedZone(
        `No sim Route53 Hosted Zone with ID ${zoneId}`,
      );
    }

    return hostedZone;
  }

  /**
   * The change info a DNSSEC change answers with.
   *
   * Route53 applies a DNSSEC change to the zone rather than to a record set,
   * and nothing here defers the work, so the change is reported against the
   * zone's own synchronization status.
   */
  changeInfo(hostedZone: SimRoute53HostedZone): SimRoute53ChangeInfo {
    return {
      Id: `/change/${hostedZone.id}`,
      Status: hostedZone.status,
      SubmittedAt: this.background.now(),
    };
  }
}
