import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53Record } from "../../record/sim-route53-record.js";
import type { SimRoute53ResourceRecordSet } from "../change-resource-record-sets/change-resource-record-sets.cmd.js";
import {
  isRecordAtOrAfterMarker,
  normaliseRecordSetListMarker,
} from "./list-record-sets-marker.js";
import { compareSimRoute53Records } from "./list-record-sets-order.js";
import { toSimRoute53ResourceRecordSet } from "./record-set-output.js";

interface RecordSetListPageProperties {
  readonly hostedZone: SimRoute53HostedZone;
  readonly maxItemsInput?: number | undefined;
  readonly startRecordName?: string | undefined;
  readonly startRecordType?: string | undefined;
}

interface RecordSetListPage {
  readonly resourceRecordSets: SimRoute53ResourceRecordSet[];
  readonly maxItems: number;
  readonly nextRecord?: SimRoute53Record | undefined;
}

/**
 * Build a sorted ListResourceRecordSets response page for one Hosted Zone.
 */
export function getRecordSetListPage(
  properties: RecordSetListPageProperties,
): RecordSetListPage {
  const maxItems = properties.maxItemsInput ?? 100;
  const marker = normaliseRecordSetListMarker({
    startRecordName: properties.startRecordName,
    startRecordType: properties.startRecordType,
  });

  const matchingRecords = properties.hostedZone.records
    .list()
    .toSorted(compareSimRoute53Records)
    .filter((record) => isRecordAtOrAfterMarker(record, marker));

  return {
    resourceRecordSets: matchingRecords
      .slice(0, maxItems)
      .map((record) => toSimRoute53ResourceRecordSet(record)),
    maxItems,
    nextRecord: matchingRecords.at(maxItems),
  };
}
