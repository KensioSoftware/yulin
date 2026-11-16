import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimDynamoDbItemCollectionSize } from "./sim-dynamodb-item-collection-metrics.js";

/**
 * The item collection sizes a write across tables reports, once for each
 * collection, as each stands after the last write to it.
 */
export class SimDynamoDbCollectionSizes {
  private readonly byTable = new Map<
    string,
    Map<string, SimDynamoDbItemCollectionSize>
  >();

  /**
   * Record the size of one collection of one table, when there is one.
   */
  add(
    reference: string,
    size: SimDynamoDbItemCollectionSize | undefined,
  ): void {
    if (size === undefined) {
      return;
    }

    const sizes =
      this.byTable.get(reference) ??
      new Map<string, SimDynamoDbItemCollectionSize>();
    sizes.set(jsonStringify(size.ItemCollectionKey), size);
    this.byTable.set(reference, sizes);
  }

  /**
   * The `ItemCollectionMetrics` field, left out when no write had a
   * collection to report.
   */
  fields(): {
    readonly ItemCollectionMetrics?: Readonly<
      Record<string, readonly SimDynamoDbItemCollectionSize[]>
    >;
  } {
    if (this.byTable.size === 0) {
      return {};
    }

    return {
      ItemCollectionMetrics: Object.fromEntries(
        this.byTable
          .entries()
          .map(([reference, sizes]) => [reference, sizes.values().toArray()]),
      ),
    };
  }
}
