/**
 * The offset basis and prime of 32 bit FNV-1a.
 */
const offsetBasis = 2_166_136_261;
const prime = 16_777_619;

/**
 * The hash of a marshalled partition key value.
 *
 * Two things read this. A scan walks partition key values in hash order, which
 * is an order that is stable within a process and is not the sorted one. A
 * parallel scan puts a partition key value in a segment by the same hash, so
 * every item sharing a partition key lands in the same segment.
 *
 * Real DynamoDB hashes the partition key to decide which physical partition an
 * item lives on, and both of those follow from that. The hash itself is not
 * DynamoDB's, which is unpublished, so the segment an item lands in here is not
 * the segment it lands in on AWS. What matches is the shape: whole item
 * collections move together, and segments come out uneven.
 */
export function simDynamoDbPartitionKeyHash(partitionKey: string): number {
  return (
    Buffer.from(partitionKey, "utf8").reduce(
      (hash, byte) => Math.imul(hash ^ byte, prime),
      offsetBasis,
    ) >>> 0
  );
}
