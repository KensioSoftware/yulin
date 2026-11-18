import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbIndexUpdate } from "./sim-dynamodb-index-update.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import type { SimDynamoDbTableUpdateProperties } from "./sim-dynamodb-table-update.js";

/**
 * Refuse a request asking for more than one thing at a time.
 *
 * AWS takes one of these per call: change what the table and its indexes are
 * billed and provisioned as, add one global secondary index, or remove one. A table class,
 * a deletion protection or a stream change is not one of them and rides along
 * with any of them.
 */
export function assertSimDynamoDbUpdateIsOneOperation(
  billing: SimDynamoDbTableBilling | undefined,
  indexUpdate: SimDynamoDbIndexUpdate,
): void {
  if (billing !== undefined && !indexUpdate.isEmpty) {
    throw new SimDynamoDbValidationException(
      "One or more parameter values were invalid: UpdateTable does one thing " +
        "at a time, and this request changes the table's throughput and a " +
        "global secondary index together",
    );
  }
}

/**
 * Refuse a request that asks for nothing.
 */
export function assertSimDynamoDbUpdateAsksForSomething(
  properties: SimDynamoDbTableUpdateProperties,
): void {
  const asks =
    properties.billing !== undefined ||
    properties.indexCreated !== undefined ||
    properties.indexDeleted !== undefined ||
    properties.indexThroughputs.size > 0 ||
    properties.tableClass !== undefined ||
    properties.deletionProtectionEnabled !== undefined ||
    properties.stream !== undefined;

  if (!asks) {
    throw new SimDynamoDbValidationException(
      "An UpdateTable request changes the table's billing and throughput, " +
        "its global secondary indexes, its stream, its table class or its " +
        "deletion protection, and this one changes none of them",
    );
  }
}
