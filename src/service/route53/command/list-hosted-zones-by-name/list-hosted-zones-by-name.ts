import type { SimRoute53HostedZoneOutput } from "../create-hosted-zone/create-hosted-zone.cmd.js";
import type { SimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import {
  isAtOrAfterMarker,
  normaliseHostedZoneListMarker,
} from "../change-resource-record-sets/list-zones-marker.js";

export interface HostedZoneListEntry {
  readonly hostedZoneId: SimRoute53HostedZoneId;
  readonly hostedZone: SimRoute53HostedZone;
}

interface HostedZoneListPageProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly maxItemsInput?: number | undefined;
  readonly markerNameInput?: string | undefined;
  readonly markerHostedZoneId?: string | undefined;
}

interface HostedZoneListPage {
  readonly hostedZones: SimRoute53HostedZoneOutput[];
  readonly maxItems: number;
  readonly nextEntry?: HostedZoneListEntry | undefined;
}

/**
 * Builds a sorted ListHostedZonesByName response page.
 */
export function getHostedZoneListPage(
  properties: HostedZoneListPageProperties,
): HostedZoneListPage {
  const maxItems = properties.maxItemsInput ?? 100;
  const marker = normaliseHostedZoneListMarker({
    markerNameInput: properties.markerNameInput,
    markerHostedZoneId: properties.markerHostedZoneId,
  });

  const matchingEntries = [...properties.hostedZones]
    .map(([hostedZoneId, hostedZone]) => ({
      hostedZoneId,
      hostedZone,
    }))
    .toSorted(compareHostedZoneListEntries)
    .filter((entry) => isAtOrAfterMarker(entry, marker));

  const pageEntries = matchingEntries.slice(0, maxItems);
  const nextEntry = matchingEntries.at(maxItems);

  return {
    hostedZones: pageEntries.map((entry) => toHostedZoneOutput(entry)),
    maxItems,
    nextEntry,
  };
}

function compareHostedZoneListEntries(
  left: HostedZoneListEntry,
  right: HostedZoneListEntry,
): number {
  const nameComparison = left.hostedZone.name.localeCompare(
    right.hostedZone.name,
  );

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.hostedZoneId.localeCompare(right.hostedZoneId);
}

function toHostedZoneOutput(
  entry: HostedZoneListEntry,
): SimRoute53HostedZoneOutput {
  const { hostedZone } = entry;

  return {
    Id: hostedZone.id,
    Name: hostedZone.name,
    CallerReference: hostedZone.callerReference,
    Config: hostedZone.config,
    ResourceRecordSetCount: hostedZone.records.count,
  };
}
