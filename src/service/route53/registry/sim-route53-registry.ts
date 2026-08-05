import type { SimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53RecordChangeListener } from "../hosted-zone/sim-route53-hosted-zone-records.js";

/**
 * Simulated Route53 DNS registry across Account scopes.
 *
 * Route53 SDK-style service instances are Account-scoped, but DNS resolution is
 * global within one simulated AWS environment. This registry lets localhost
 * request routing resolve hostnames from hosted zones created in any simulated
 * Account.
 */
export class SimRoute53Registry {
  private readonly hostedZonesById = new Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >();

  private readonly recordChangeListeners =
    new Set<SimRoute53RecordChangeListener>();

  /**
   * Register a Hosted Zone for global DNS-style resolution.
   */
  registerHostedZone(
    hostedZoneId: SimRoute53HostedZoneId,
    hostedZone: SimRoute53HostedZone,
  ): void {
    this.hostedZonesById.set(hostedZoneId, hostedZone);
    hostedZone.records.onChange(() => {
      this.notifyRecordChange();
    });
  }

  /**
   * Stop resolving a Hosted Zone, because it has been deleted.
   *
   * Anything watching for record changes stays subscribed: zones come and go
   * while other simulated services are already watching, which is why the
   * listeners are held here rather than on one zone.
   */
  deregisterHostedZone(hostedZoneId: SimRoute53HostedZoneId): void {
    this.hostedZonesById.delete(hostedZoneId);
    this.notifyRecordChange();
  }

  /**
   * Register a listener called whenever a record changes in any registered
   * Hosted Zone.
   *
   * Hosted zones come and go while other simulated services are already
   * watching DNS, so listeners subscribe here rather than to one zone.
   */
  onRecordChange(listener: SimRoute53RecordChangeListener): void {
    this.recordChangeListeners.add(listener);
  }

  /**
   * Get all globally resolvable Hosted Zones.
   */
  get hostedZones(): ReadonlyMap<SimRoute53HostedZoneId, SimRoute53HostedZone> {
    return this.hostedZonesById;
  }

  private notifyRecordChange(): void {
    for (const listener of this.recordChangeListeners) {
      listener();
    }
  }
}
