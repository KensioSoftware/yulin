import { normaliseSimRoute53Name } from "../local-name/sim-route53-local-name.js";
import type {
  SimRoute53Record,
  SimRoute53RecordType,
} from "../record/sim-route53-record.js";

/**
 * Stores and normalises records for a simulated Route53 Hosted Zone.
 * @internal
 */
export class SimRoute53HostedZoneRecords {
  private readonly records = new Map<string, SimRoute53Record>();

  /**
   * Current number of records in the hosted zone.
   * @internal
   */
  get count(): number {
    return this.records.size;
  }

  /**
   * Create a record, rejecting duplicate name/type pairs.
   * @internal
   */
  create(record: SimRoute53Record): void {
    const normalisedRecord = normaliseRecord(record);
    const key = recordKey(normalisedRecord.name, normalisedRecord.type);

    /* v8 ignore if */
    if (this.records.has(key)) {
      throw new Error(
        `Route53 record ${normalisedRecord.type} ${normalisedRecord.name} already exists`,
      );
    }

    this.records.set(key, normalisedRecord);
  }

  /**
   * Create or replace a record.
   * @internal
   */
  upsert(record: SimRoute53Record): void {
    const normalisedRecord = normaliseRecord(record);

    this.records.set(
      recordKey(normalisedRecord.name, normalisedRecord.type),
      normalisedRecord,
    );
  }

  /**
   * Delete a record by logical name and type.
   * @internal
   */
  delete(name: string, type: SimRoute53RecordType): void {
    this.records.delete(recordKey(normaliseSimRoute53Name(name), type));
  }

  /**
   * Get a record by logical name and type.
   * @internal
   */
  get(name: string, type: SimRoute53RecordType): SimRoute53Record | undefined {
    const record = this.records.get(
      recordKey(normaliseSimRoute53Name(name), type),
    );

    if (record === undefined) {
      return undefined;
    }

    return {
      ...record,
      values: [...record.values],
    };
  }
}

function normaliseRecord(record: SimRoute53Record): SimRoute53Record {
  return {
    ...record,
    name: normaliseSimRoute53Name(record.name),
    values: record.values.map((value) =>
      normaliseRecordValue(record.type, value),
    ),
  };
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
