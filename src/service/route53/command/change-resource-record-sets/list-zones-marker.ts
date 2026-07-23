import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import { normaliseSimRoute53Name } from "../../local-name/sim-route53-local-name.js";
import type { HostedZoneListEntry } from "../list-hosted-zones-by-name/list-hosted-zones-by-name.js";

interface HostedZoneListMarkerProperties {
  readonly markerNameInput?: string | undefined;
  readonly markerHostedZoneId?: string | undefined;
}

interface HostedZoneListMarker {
  readonly markerName?: string | undefined;
  readonly markerHostedZoneId?: SimRoute53HostedZoneId | undefined;
}

/**
 * Normalise ListHostedZonesByName marker inputs before pagination comparison.
 */
export function normaliseHostedZoneListMarker(
  properties: HostedZoneListMarkerProperties,
): HostedZoneListMarker {
  return {
    markerName: normaliseMarkerName(properties.markerNameInput),
    markerHostedZoneId: normaliseMarkerHostedZoneId(
      properties.markerHostedZoneId,
    ),
  };
}

/**
 * Whether a hosted zone entry is positioned after the requested marker.
 */
export function isAtOrAfterMarker(
  entry: HostedZoneListEntry,
  marker: HostedZoneListMarker,
): boolean {
  if (marker.markerName === undefined) {
    return true;
  }

  const nameComparison = entry.hostedZone.name.localeCompare(marker.markerName);

  if (nameComparison > 0) {
    return true;
  }

  if (nameComparison < 0) {
    return false;
  }

  if (marker.markerHostedZoneId === undefined) {
    return true;
  }

  return entry.hostedZoneId.localeCompare(marker.markerHostedZoneId) >= 0;
}

function normaliseMarkerName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }

  return `${normaliseSimRoute53Name(name)}.`;
}

function normaliseMarkerHostedZoneId(
  hostedZoneId: string | undefined,
): SimRoute53HostedZoneId | undefined {
  if (hostedZoneId === undefined) {
    return undefined;
  }

  return normalizeSimRoute53HostedZoneId(hostedZoneId);
}
