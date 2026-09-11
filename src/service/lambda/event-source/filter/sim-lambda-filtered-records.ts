import type { SimLambdaFilterCriteria } from "./sim-lambda-filter-criteria.js";

/**
 * The records of a batch a mapping's filters let through.
 *
 * A mapping with no criteria delivers the batch it read. One with criteria
 * delivers the records that match, and treats the rest as handled: a stream
 * moves its checkpoint past them and a queue deletes them, which is what real
 * Lambda does with a record it filtered out.
 *
 * What a pattern reads is the record as the function would have received it,
 * with the source's own data field decoded. That translation is the source's,
 * so it is handed in.
 */
export function simLambdaFilteredRecords<RecordType>(
  criteria: SimLambdaFilterCriteria | undefined,
  records: readonly RecordType[],
  documentOf: (record: RecordType) => Record<string, unknown>,
): readonly RecordType[] {
  if (criteria === undefined) {
    return records;
  }

  return records.filter((record) => criteria.matches(documentOf(record)));
}

/**
 * The JSON a data field holds, or the text it is when it holds no JSON.
 *
 * Real Lambda filters a record's data only when both the data and the pattern
 * for it are JSON. Text that parses is handed to the pattern as the object it
 * parses to, and text that does not is handed over as itself, which a pattern
 * written for an object then fails to match. Either way the record is dropped
 * exactly where AWS drops it.
 */
export function simLambdaFilterData(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
