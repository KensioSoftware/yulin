import type {
  SimRoute53Record,
  SimRoute53RecordType,
} from "../record/sim-route53-record.js";
import { normaliseSimRoute53Name } from "../local-name/sim-route53-local-name.js";

/**
 * Internal storage for simulated Route53 records.
 */
export class SimRoute53Zone {
  private readonly records = new Map<string, SimRoute53Record>();

  /**
   * Create or replace a record in this zone.
   */
  upsertRecord(record: SimRoute53Record): void {
    const normalisedRecord = {
      ...record,
      name: normaliseSimRoute53Name(record.name),
      values: record.values.map((value) =>
        normaliseRecordValue(record.type, value),
      ),
    };

    this.records.set(
      recordKey(normalisedRecord.name, normalisedRecord.type),
      normalisedRecord,
    );
  }

  /**
   * Get a record by logical name and type.
   */
  record(
    name: string,
    type: SimRoute53RecordType,
  ): SimRoute53Record | undefined {
    return this.records.get(recordKey(normaliseSimRoute53Name(name), type));
  }
}

function recordKey(name: string, type: SimRoute53RecordType): string {
  return `${type}:${name}`;
}

function normaliseRecordValue(
  type: SimRoute53RecordType,
  value: string,
): string {
  return type === "TXT" ? value : normaliseSimRoute53Name(value);
}
