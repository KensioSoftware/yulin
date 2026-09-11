import type { SimLambdaFilterCriteria } from "./sim-lambda-filter-criteria.js";
import { simLambdaFilteredRecords } from "./sim-lambda-filtered-records.js";

interface SimLambdaFilteredDeliveryProperties<RecordType, Outcome> {
  readonly criteria: SimLambdaFilterCriteria | undefined;
  readonly records: readonly RecordType[];

  /**
   * What a pattern reads one record as, which is the source's translation.
   */
  readonly documentOf: (record: RecordType) => Record<string, unknown>;

  /**
   * What becomes of a batch the filters emptied.
   */
  readonly handled: () => Outcome;

  /**
   * Hand the records that matched to the function.
   */
  readonly invoke: (delivered: readonly RecordType[]) => Promise<Outcome>;
}

/**
 * Deliver the records of a batch a mapping's filters let through.
 *
 * A batch the filters emptied is finished with and the function is never
 * invoked, which is the one rule every source shares. What being finished with
 * means is the source's own, and so is what a pattern reads a record as, so
 * both are handed in.
 */
export async function simLambdaFilteredDelivery<RecordType, Outcome>(
  properties: SimLambdaFilteredDeliveryProperties<RecordType, Outcome>,
): Promise<Outcome> {
  const delivered = simLambdaFilteredRecords(
    properties.criteria,
    properties.records,
    properties.documentOf,
  );

  return delivered.length === 0
    ? properties.handled()
    : await properties.invoke(delivered);
}
