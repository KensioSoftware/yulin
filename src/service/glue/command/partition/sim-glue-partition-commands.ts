import { SimGlueInvalidInputException } from "../../error/sim-glue.error.js";
import type { SimGlueRequestOptions } from "../sim-glue-request-options.js";
import { simGluePartitionDetail } from "./sim-glue-partition-detail.js";
import { simGluePartitionBatchErrors } from "./sim-glue-partition-batch.js";
import type { SimGluePartitionRegistry } from "./sim-glue-partition-registry.js";
import type {
  SimBatchCreatePartitionCommand,
  SimBatchCreatePartitionCommandOutput,
  SimBatchDeletePartitionCommand,
  SimBatchDeletePartitionCommandOutput,
  SimCreatePartitionCommand,
  SimCreatePartitionCommandOutput,
  SimDeletePartitionCommand,
  SimDeletePartitionCommandOutput,
  SimGetPartitionCommand,
  SimGetPartitionCommandOutput,
  SimGetPartitionsCommand,
  SimGetPartitionsCommandOutput,
} from "./partition.command.js";

interface SimGluePartitionCommandsProperties {
  readonly registry: SimGluePartitionRegistry;
}

/**
 * The commands that register, read and remove Glue partitions.
 */
export class SimGluePartitionCommands {
  readonly #registry: SimGluePartitionRegistry;

  constructor(properties: SimGluePartitionCommandsProperties) {
    this.#registry = properties.registry;
  }

  /**
   * Register one partition against a table.
   */
  createPartition(
    command: SimCreatePartitionCommand,
    options?: SimGlueRequestOptions,
  ): SimCreatePartitionCommandOutput {
    const table = this.#registry.requireTable(
      "glue:CreatePartition",
      command.input,
      options,
    );

    this.#registry.create(
      table,
      "PartitionInput",
      command.input.PartitionInput ?? {},
    );

    return { $metadata: {} };
  }

  /**
   * Register several partitions at once, reporting the ones it could not make.
   *
   * A batch does not fail on one bad entry. Real Glue answers with the errors
   * alongside the partitions it did register, so a caller adding a day's worth
   * learns which values were already there and keeps the rest.
   */
  batchCreatePartition(
    command: SimBatchCreatePartitionCommand,
    options?: SimGlueRequestOptions,
  ): SimBatchCreatePartitionCommandOutput {
    const table = this.#registry.requireTable(
      "glue:BatchCreatePartition",
      command.input,
      options,
    );

    return {
      Errors: simGluePartitionBatchErrors(
        "PartitionInputList",
        command.input.PartitionInputList,
        (input, label) => {
          this.#registry.create(table, label, input);
        },
      ),
      $metadata: {},
    };
  }

  /**
   * Read one partition back by its values.
   */
  getPartition(
    command: SimGetPartitionCommand,
    options?: SimGlueRequestOptions,
  ): SimGetPartitionCommandOutput {
    const table = this.#registry.requireTable(
      "glue:GetPartition",
      command.input,
      options,
    );

    return {
      Partition: simGluePartitionDetail(
        this.#registry.require(
          table,
          "PartitionValues",
          command.input.PartitionValues,
        ),
      ),
      $metadata: {},
    };
  }

  /**
   * Read every partition of one table, in registration order.
   */
  getPartitions(
    command: SimGetPartitionsCommand,
    options?: SimGlueRequestOptions,
  ): SimGetPartitionsCommandOutput {
    const table = this.#registry.requireTable(
      "glue:GetPartitions",
      command.input,
      options,
    );

    if (command.input.Expression !== undefined) {
      throw new SimGlueInvalidInputException(
        "GetPartitions Expression is not simulated, so it is refused rather " +
          "than ignored. An ignored filter answers with the partitions the " +
          "caller asked to leave out.",
      );
    }

    return {
      Partitions: this.#registry.inTable(table).map(simGluePartitionDetail),
      $metadata: {},
    };
  }

  /**
   * Remove one partition, leaving the table and the data alone.
   */
  deletePartition(
    command: SimDeletePartitionCommand,
    options?: SimGlueRequestOptions,
  ): SimDeletePartitionCommandOutput {
    const table = this.#registry.requireTable(
      "glue:DeletePartition",
      command.input,
      options,
    );

    this.#registry.remove(
      table,
      "PartitionValues",
      command.input.PartitionValues,
    );

    return { $metadata: {} };
  }

  /**
   * Remove several partitions at once, reporting the ones it could not find.
   */
  batchDeletePartition(
    command: SimBatchDeletePartitionCommand,
    options?: SimGlueRequestOptions,
  ): SimBatchDeletePartitionCommandOutput {
    const table = this.#registry.requireTable(
      "glue:BatchDeletePartition",
      command.input,
      options,
    );

    return {
      Errors: simGluePartitionBatchErrors(
        "PartitionsToDelete",
        command.input.PartitionsToDelete,
        (entry, label) => {
          this.#registry.remove(table, label, entry.Values);
        },
      ),
      $metadata: {},
    };
  }
}
