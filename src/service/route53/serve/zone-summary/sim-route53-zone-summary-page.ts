import type { SimRoute53HostedZoneId } from "../../command/create-hosted-zone/sim-route53-zone-id.js";
import { compareOrdinal } from "../../command/list-resource-record-sets/list-record-sets-order.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import { simRoute53SummaryStyle } from "./sim-route53-summary-style.js";
import { SimRoute53ZoneSection } from "./sim-route53-zone-section.js";

/**
 * Renders the simulated Route53 hosted-zone summary served at
 * `dns.sim-aws.localhost`.
 *
 * The page reads the hosted-zone model directly rather than going through the
 * ListResourceRecordSets command, because it is a local development view of the
 * whole simulated environment rather than an AWS API call. It is not scoped to
 * one Account and does not apply sim IAM authorization.
 */
export class SimRoute53ZoneSummaryPage {
  private readonly hostedZones: ReadonlyMap<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >;
  private readonly zoneSection = new SimRoute53ZoneSection();

  constructor(
    hostedZones: ReadonlyMap<SimRoute53HostedZoneId, SimRoute53HostedZone>,
  ) {
    this.hostedZones = hostedZones;
  }

  /**
   * Render the summary as a complete HTML document.
   */
  render(): string {
    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      "<title>Simulated Route53</title>",
      simRoute53SummaryStyle,
      "</head>",
      "<body>",
      "<h1>Simulated Route53</h1>",
      this.renderHostedZones(),
      "</body>",
      "</html>",
    ].join("\n");
  }

  private renderHostedZones(): string {
    const hostedZones = this.sortedHostedZones();

    if (hostedZones.length === 0) {
      return '<p class="empty">No simulated Route53 hosted zones exist yet.</p>';
    }

    return hostedZones
      .map((hostedZone) => this.zoneSection.render(hostedZone))
      .join("\n");
  }

  /**
   * Sort by hosted-zone name, then by ID because zone names are not unique.
   */
  private sortedHostedZones(): readonly SimRoute53HostedZone[] {
    return this.hostedZones
      .values()
      .toArray()
      .toSorted((left, right) => {
        const nameComparison = compareOrdinal(left.name, right.name);

        if (nameComparison !== 0) {
          return nameComparison;
        }

        return compareOrdinal(left.id, right.id);
      });
  }
}
