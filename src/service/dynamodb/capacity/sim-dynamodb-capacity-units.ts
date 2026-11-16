/**
 * How a read is made, which decides what it costs per 4 KB.
 *
 * An eventually consistent read costs half a unit, a strongly consistent one a
 * whole unit, and a read inside a transaction two.
 */
export type SimDynamoDbReadConsistency =
  | "eventual"
  | "strong"
  | "transactional";

const readUnitsPer4Kb: ReadonlyMap<SimDynamoDbReadConsistency, number> =
  new Map([
    ["eventual", 0.5],
    ["strong", 1],
    ["transactional", 2],
  ]);

/**
 * The bytes one read unit covers.
 */
const readUnitBytes = 4 * 1024;

/**
 * The bytes one write unit covers.
 */
const writeUnitBytes = 1024;

/**
 * How a read with this `ConsistentRead` is made.
 */
export function simDynamoDbReadConsistency(
  consistentRead: boolean | undefined,
): SimDynamoDbReadConsistency {
  return consistentRead === true ? "strong" : "eventual";
}

/**
 * The read units reading this many bytes consumes.
 *
 * The size is rounded up to the next 4 KB, and a read of nothing still costs
 * the first 4 KB, as AWS charges a read of an absent item.
 */
export function simDynamoDbReadUnits(
  bytes: number,
  consistency: SimDynamoDbReadConsistency,
): number {
  return blocks(bytes, readUnitBytes) * (readUnitsPer4Kb.get(consistency) ?? 1);
}

/**
 * The write units writing this many bytes consumes.
 *
 * The size is rounded up to the next 1 KB, and a write of nothing still costs
 * one unit, as AWS charges a delete of an absent item. A write inside a
 * transaction costs twice as much, since DynamoDB prepares and then commits it.
 */
export function simDynamoDbWriteUnits(
  bytes: number,
  transactional: boolean,
): number {
  return blocks(bytes, writeUnitBytes) * (transactional ? 2 : 1);
}

/**
 * How many blocks of a size some bytes take, never fewer than one.
 */
function blocks(bytes: number, blockBytes: number): number {
  return Math.max(1, Math.ceil(bytes / blockBytes));
}
