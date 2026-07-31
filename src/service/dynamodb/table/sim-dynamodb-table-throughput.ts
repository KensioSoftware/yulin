import type {
  SimDynamoDbProvisionedThroughput,
  SimDynamoDbProvisionedThroughputDescription,
} from "../command/table/table.command.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * Read a capacity unit count a provisioned table has to carry.
 */
function capacityUnits(units: number | undefined, name: string): number {
  if (units === undefined || units < 1) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: ${name} must be at least 1 ` +
        `when BillingMode is PROVISIONED`,
    );
  }

  return units;
}

/**
 * The capacity a simulated table is provisioned with.
 *
 * Nothing here enforces it. It is stored and reported because a deployment
 * reads it back, and because a table created with capacity real DynamoDB would
 * refuse should be refused here too.
 */
export class SimDynamoDbTableThroughput {
  private readonly readCapacityUnits: number;
  private readonly writeCapacityUnits: number;

  private constructor(readCapacityUnits: number, writeCapacityUnits: number) {
    this.readCapacityUnits = readCapacityUnits;
    this.writeCapacityUnits = writeCapacityUnits;
  }

  /**
   * The capacity an on-demand table has, which is none.
   */
  static none(): SimDynamoDbTableThroughput {
    return new this(0, 0);
  }

  /**
   * Read the capacity a provisioned table has to be created with.
   */
  static required(
    throughput: SimDynamoDbProvisionedThroughput | undefined,
  ): SimDynamoDbTableThroughput {
    if (throughput === undefined) {
      throw new SimDynamoDbValidationException(
        "One or more parameter values were invalid: ReadCapacityUnits and " +
          "WriteCapacityUnits must both be specified when BillingMode is " +
          "PROVISIONED",
      );
    }

    return new this(
      capacityUnits(throughput.ReadCapacityUnits, "ReadCapacityUnits"),
      capacityUnits(throughput.WriteCapacityUnits, "WriteCapacityUnits"),
    );
  }

  /**
   * How a table reports its throughput.
   *
   * Real DynamoDB reports a throughput for an on-demand table too, with no
   * capacity units in it, so the field is there whichever way a table is
   * billed.
   */
  toDescription(): SimDynamoDbProvisionedThroughputDescription {
    return {
      ReadCapacityUnits: this.readCapacityUnits,
      WriteCapacityUnits: this.writeCapacityUnits,
      // Nothing here scales a table down, so there is never a decrease to count.
      NumberOfDecreasesToday: 0,
    };
  }
}
