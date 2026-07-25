import { compareSimRoute53Records } from "../../command/list-resource-record-sets/list-record-sets-order.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import { simRoute53AbsoluteName } from "../../local-name/sim-route53-local-name.js";
import type { SimRoute53Record } from "../../record/sim-route53-record.js";
import {
  escapeSimRoute53Html,
  simRoute53TableRow,
} from "./sim-route53-summary-html.js";

/**
 * Renders one hosted zone and its records as a section of the summary page.
 */
export class SimRoute53ZoneSection {
  /**
   * Render the hosted zone heading, metadata and record table.
   */
  render(hostedZone: SimRoute53HostedZone): string {
    const records = hostedZone.records
      .list()
      .toSorted(compareSimRoute53Records);

    return [
      `<h2>${escapeSimRoute53Html(hostedZone.name)}</h2>`,
      this.renderMetadata(hostedZone, records.length),
      this.renderRecords(records),
    ].join("\n");
  }

  private renderMetadata(
    hostedZone: SimRoute53HostedZone,
    recordCount: number,
  ): string {
    const parts = [
      hostedZone.id,
      hostedZone.status,
      `${String(recordCount)} record(s)`,
    ].map((part) => escapeSimRoute53Html(part));

    return `<p class="zone-meta">${parts.join(" — ")}</p>`;
  }

  private renderRecords(records: readonly SimRoute53Record[]): string {
    if (records.length === 0) {
      return '<p class="empty">No records in this hosted zone.</p>';
    }

    const rows = records.map((record) => this.renderRecordRow(record));

    return [
      "<table>",
      "<tr><th>Name</th><th>Type</th><th>TTL</th><th>Value</th></tr>",
      ...rows,
      "</table>",
    ].join("\n");
  }

  private renderRecordRow(record: SimRoute53Record): string {
    return simRoute53TableRow([
      simRoute53AbsoluteName(record.name),
      record.type,
      recordTtl(record),
      recordValue(record),
    ]);
  }
}

/**
 * Alias records carry no TTL, because Route53 answers them using the TTL of the
 * target they point at.
 */
function recordTtl(record: SimRoute53Record): string {
  if (record.ttl === undefined) {
    return "—";
  }

  return String(record.ttl);
}

function recordValue(record: SimRoute53Record): string {
  const value = record.values.join(", ");

  if (record.alias === true) {
    return `${value} (alias)`;
  }

  return value;
}
