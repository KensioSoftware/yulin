import { isRecord } from "../../../../util/type-guard/record.js";

/**
 * The batch item failure report a function may send back.
 *
 * Reading the report is the same for every event source that accepts one: the
 * mapping has to have been told to expect it, and the entries have to name
 * something. What is done with the ids it names belongs to the source, so that
 * stays with the source's own batch response.
 */
export class SimLambdaBatchItemFailures {
  private readonly reportsBatchItemFailures: boolean;

  constructor(reportsBatchItemFailures: boolean) {
    this.reportsBatchItemFailures = reportsBatchItemFailures;
  }

  /**
   * The item ids a report names, or undefined when the function reported none.
   */
  idsIn(result: unknown): readonly string[] | undefined {
    if (!this.reportsBatchItemFailures || !isRecord(result)) {
      return undefined;
    }

    const reported = result["batchItemFailures"];

    if (!Array.isArray(reported) || reported.length === 0) {
      return undefined;
    }

    return reported.map((failure: unknown) => itemIdentifier(failure));
  }
}

/**
 * The item id one reported failure names.
 *
 * An entry naming nothing is reported as an empty id, which no item has, so the
 * whole batch goes back. That is what real Lambda does with a malformed report
 * rather than dropping the entry.
 */
function itemIdentifier(failure: unknown): string {
  if (!isRecord(failure)) {
    return "";
  }

  const identifier = failure["itemIdentifier"];

  if (typeof identifier !== "string") {
    return "";
  }

  return identifier;
}
