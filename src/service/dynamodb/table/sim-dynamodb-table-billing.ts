import type {
  SimDynamoDbBillingMode,
  SimDynamoDbBillingModeSummary,
  SimDynamoDbProvisionedThroughput,
  SimDynamoDbProvisionedThroughputDescription,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbTableThroughput } from "./sim-dynamodb-table-throughput.js";

interface SimDynamoDbTableBillingInput {
  readonly BillingMode?: string | undefined;
  readonly ProvisionedThroughput?: SimDynamoDbProvisionedThroughput | undefined;
}

interface SimDynamoDbTableBillingProperties {
  readonly mode: SimDynamoDbBillingMode;
  readonly throughput: SimDynamoDbTableThroughput;
  readonly requestedMode: boolean;
}

const billingModes: ReadonlySet<string> = new Set([
  "PROVISIONED",
  "PAY_PER_REQUEST",
]);

/**
 * Read the billing mode a request names, defaulting to the one AWS defaults to.
 */
function readBillingMode(
  requested: string | undefined,
): SimDynamoDbBillingMode {
  if (requested === undefined) {
    return "PROVISIONED";
  }

  if (!billingModes.has(requested)) {
    throw new SimDynamoDbValidationException(
      `BillingMode '${requested}' is invalid. It is one of PROVISIONED or ` +
        `PAY_PER_REQUEST.`,
    );
  }

  return requested as SimDynamoDbBillingMode;
}

/**
 * Read the capacity that goes with a billing mode.
 *
 * The two contradict each other in both directions. A provisioned table has to
 * say what it is provisioned with, and an on-demand table has nothing to
 * provision, so naming a throughput for one is refused.
 */
function readThroughput(
  mode: SimDynamoDbBillingMode,
  input: SimDynamoDbTableBillingInput,
): SimDynamoDbTableThroughput {
  if (mode === "PROVISIONED") {
    return SimDynamoDbTableThroughput.required(input.ProvisionedThroughput);
  }

  if (input.ProvisionedThroughput !== undefined) {
    throw new SimDynamoDbValidationException(
      "One or more parameter values were invalid: Neither ReadCapacityUnits " +
        "nor WriteCapacityUnits can be specified when BillingMode is " +
        "PAY_PER_REQUEST",
    );
  }

  return SimDynamoDbTableThroughput.none();
}

/**
 * How a simulated table is billed, and what it is provisioned for.
 *
 * `BillingMode` defaults to `PROVISIONED`, which is what makes
 * `ProvisionedThroughput` required on a request that leaves it out.
 */
export class SimDynamoDbTableBilling {
  public readonly mode: SimDynamoDbBillingMode;

  private readonly throughput: SimDynamoDbTableThroughput;
  private readonly requestedMode: boolean;

  private constructor(properties: SimDynamoDbTableBillingProperties) {
    this.mode = properties.mode;
    this.throughput = properties.throughput;
    this.requestedMode = properties.requestedMode;
  }

  /**
   * Read the billing mode and throughput a CreateTable request carries.
   */
  static fromInput(
    input: SimDynamoDbTableBillingInput,
  ): SimDynamoDbTableBilling {
    const mode = readBillingMode(input.BillingMode);

    return new this({
      mode,
      throughput: readThroughput(mode, input),
      requestedMode: input.BillingMode !== undefined,
    });
  }

  /**
   * This billing with the capacity an UpdateTable request names.
   *
   * A request carrying capacity and no `BillingMode` is asking to reprovision
   * the table rather than to bill it another way, so the mode is kept. Whether
   * the table reports a `BillingModeSummary` is kept too, since that says
   * whether the request that made it named a mode, and this request did not.
   */
  withThroughput(
    throughput: SimDynamoDbProvisionedThroughput | undefined,
  ): SimDynamoDbTableBilling {
    return new SimDynamoDbTableBilling({
      mode: this.mode,
      throughput: readThroughput(this.mode, {
        ProvisionedThroughput: throughput,
      }),
      requestedMode: this.requestedMode,
    });
  }

  /**
   * How the table reports its throughput.
   */
  throughputDescription(): SimDynamoDbProvisionedThroughputDescription {
    return this.throughput.toDescription();
  }

  /**
   * How the table reports its billing mode, when the request named one.
   */
  summary(): SimDynamoDbBillingModeSummary | undefined {
    if (!this.requestedMode) {
      return undefined;
    }

    return { BillingMode: this.mode };
  }
}
