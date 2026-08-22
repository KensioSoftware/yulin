import { SimKinesisInvalidArgumentException } from "../../error/sim-kinesis.error.js";
import { simKinesisHashKeySpace } from "../../stream/sim-kinesis-hash-key.js";

/**
 * The largest record real Kinesis accepts, before base64 encoding.
 */
export const simKinesisMaxRecordBytes = 1024 * 1024;

/**
 * The longest partition key real Kinesis accepts.
 */
const maxPartitionKeyLength = 256;

/**
 * One record as any of the put operations carries it.
 */
export interface SimKinesisPutEntry {
  readonly Data?: Uint8Array | undefined;
  readonly PartitionKey?: string | undefined;
  readonly ExplicitHashKey?: string | undefined;
}

/**
 * One record, read out of a request and checked against what Kinesis accepts.
 */
export interface SimKinesisReadPutEntry {
  readonly partitionKey: string;
  readonly explicitHashKey: bigint | undefined;
  readonly data: Uint8Array;
}

/**
 * Read the partition key a record carries.
 */
function readPartitionKey(partitionKey: string | undefined): string {
  if (partitionKey === undefined || partitionKey === "") {
    throw new SimKinesisInvalidArgumentException(
      "PartitionKey is required on every record and may not be empty",
    );
  }

  if (partitionKey.length > maxPartitionKeyLength) {
    throw new SimKinesisInvalidArgumentException(
      `PartitionKey is longer than the ${maxPartitionKeyLength} characters ` +
        `Kinesis accepts`,
    );
  }

  return partitionKey;
}

/**
 * Read the explicit hash key a record carries, when it carries one.
 *
 * Kinesis takes it as a decimal string because the hash key space runs to
 * 2^128, which no JSON number can hold.
 */
function readExplicitHashKey(
  explicitHashKey: string | undefined,
): bigint | undefined {
  if (explicitHashKey === undefined) {
    return undefined;
  }

  let value: bigint;

  try {
    value = BigInt(explicitHashKey);
  } catch {
    throw new SimKinesisInvalidArgumentException(
      `ExplicitHashKey '${explicitHashKey}' is not a whole number`,
    );
  }

  if (value < 0n || value >= simKinesisHashKeySpace) {
    throw new SimKinesisInvalidArgumentException(
      `ExplicitHashKey '${explicitHashKey}' is outside the 128 bit hash key ` +
        `space`,
    );
  }

  return value;
}

/**
 * Read the data a record carries.
 */
function readData(data: Uint8Array | undefined): Uint8Array {
  if (data === undefined) {
    throw new SimKinesisInvalidArgumentException(
      "Data is required on every record",
    );
  }

  if (data.byteLength > simKinesisMaxRecordBytes) {
    throw new SimKinesisInvalidArgumentException(
      `Data is ${data.byteLength} bytes, more than the ` +
        `${simKinesisMaxRecordBytes} bytes Kinesis accepts in one record`,
    );
  }

  return data;
}

/**
 * Read one record out of a request, refusing anything Kinesis would refuse.
 */
export function simKinesisReadPutEntry(
  entry: SimKinesisPutEntry,
): SimKinesisReadPutEntry {
  return {
    partitionKey: readPartitionKey(entry.PartitionKey),
    explicitHashKey: readExplicitHashKey(entry.ExplicitHashKey),
    data: readData(entry.Data),
  };
}
