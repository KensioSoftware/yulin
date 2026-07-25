import { normaliseSimRoute53Name } from "../../local-name/sim-route53-local-name.js";
import type { SimRoute53Record } from "../../record/sim-route53-record.js";
import {
  compareOrdinal,
  compareSimRoute53RecordNames,
} from "./list-record-sets-order.js";

interface RecordSetListMarkerProperties {
  readonly startRecordName?: string | undefined;
  readonly startRecordType?: string | undefined;
}

export interface RecordSetListMarker {
  readonly markerName?: string | undefined;
  readonly markerType?: string | undefined;
}

/**
 * Normalise ListResourceRecordSets marker inputs before pagination comparison.
 *
 * Marker names are normalised the same way stored record names are, so a
 * caller can pass `www.example.test` or `www.example.test.` and get the same
 * page back.
 */
export function normaliseRecordSetListMarker(
  properties: RecordSetListMarkerProperties,
): RecordSetListMarker {
  return {
    markerName: normaliseMarkerName(properties.startRecordName),
    markerType: properties.startRecordType,
  };
}

/**
 * Whether a record is positioned at or after the requested marker.
 *
 * A marker name without a marker type starts at the first record of that name,
 * which matches how Route53 treats `StartRecordName` on its own.
 */
export function isRecordAtOrAfterMarker(
  record: SimRoute53Record,
  marker: RecordSetListMarker,
): boolean {
  if (marker.markerName === undefined) {
    return true;
  }

  const nameComparison = compareSimRoute53RecordNames(
    record.name,
    marker.markerName,
  );

  if (nameComparison > 0) {
    return true;
  }

  if (nameComparison < 0) {
    return false;
  }

  if (marker.markerType === undefined) {
    return true;
  }

  // Ordinal, matching how the sort orders record types, so the filter cannot
  // disagree with the ordering the marker was produced from.
  return compareOrdinal(record.type, marker.markerType) >= 0;
}

function normaliseMarkerName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }

  return normaliseSimRoute53Name(name);
}
