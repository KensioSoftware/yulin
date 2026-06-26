import type { SimRoute53HostedZoneOutput } from "../create-hosted-zone/create-hosted-zone.cmd.js";
import type { SimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import { normaliseSimRoute53Name } from "../../local-name/sim-route53-local-name.js";

interface HostedZoneListEntry {
  readonly hostedZoneId: SimRoute53HostedZoneId;
  readonly hostedZone: SimRoute53HostedZone;
}

interface HostedZoneListPageProps {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly maxItemsInput?: string | undefined;
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
  props: HostedZoneListPageProps,
): HostedZoneListPage {
  const maxItems = parseMaxItems(props.maxItemsInput);
  const markerName = normaliseMarkerName(props.markerNameInput);

  const matchingEntries = [...props.hostedZones.entries()]
    .map(([hostedZoneId, hostedZone]) => ({
      hostedZoneId,
      hostedZone,
    }))
    .toSorted(compareHostedZoneListEntries)
    .filter((entry) =>
      isAtOrAfterMarker(entry, markerName, props.markerHostedZoneId),
    );

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

function isAtOrAfterMarker(
  entry: HostedZoneListEntry,
  markerName: string | undefined,
  markerHostedZoneId: string | undefined,
): boolean {
  if (markerName === undefined) {
    return true;
  }

  const nameComparison = entry.hostedZone.name.localeCompare(markerName);

  if (nameComparison > 0) {
    return true;
  }

  if (nameComparison < 0) {
    return false;
  }

  if (markerHostedZoneId === undefined) {
    return true;
  }

  return entry.hostedZoneId.localeCompare(markerHostedZoneId) > 0;
}

function normaliseMarkerName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }

  return `${normaliseSimRoute53Name(name)}.`;
}

function parseMaxItems(maxItemsInput: string | undefined): number {
  if (maxItemsInput === undefined) {
    return 100;
  }

  const maxItems = Number.parseInt(maxItemsInput, 10);

  if (!Number.isSafeInteger(maxItems) || maxItems < 1) {
    throw new Error("ListHostedZonesByNameCommand.input.MaxItems is invalid");
  }

  return maxItems;
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
