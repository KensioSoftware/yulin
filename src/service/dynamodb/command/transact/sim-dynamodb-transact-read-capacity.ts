import {
  SimDynamoDbCapacityTally,
  simDynamoDbTableTarget,
} from "../../capacity/sim-dynamodb-capacity-tally.js";
import { simDynamoDbReadUnits } from "../../capacity/sim-dynamodb-capacity-units.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";

interface SimDynamoDbTransactReadTarget {
  readonly item: {
    readonly reference: string | undefined;
    readonly key: SimDynamoDbItem;
  };
  readonly table: SimDynamoDbTable;
}

/**
 * What each table a transactional read reached consumed.
 *
 * Every Get is a transactional read of the whole item, two units per 4 KB,
 * whatever its projection keeps. A key holding nothing still costs the first
 * 4 KB.
 */
export function simDynamoDbTransactReadTallies(
  targets: readonly SimDynamoDbTransactReadTarget[],
): readonly SimDynamoDbCapacityTally[] {
  const tallies = new Map<string, SimDynamoDbCapacityTally>();

  for (const { item, table } of targets) {
    const reference = item.reference ?? table.tableName;
    const tally =
      tallies.get(reference) ?? new SimDynamoDbCapacityTally(reference);
    tallies.set(reference, tally);
    tally.read(
      simDynamoDbTableTarget,
      simDynamoDbReadUnits(
        table.getItem(item.key)?.sizeInBytes() ?? 0,
        "transactional",
      ),
    );
  }

  return tallies.values().toArray();
}
