import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import {
  simPersonalizeDatasetDetail,
  simPersonalizeDatasetSummary,
} from "../../view/sim-personalize-dataset-view.js";
import type {
  SimDescribeDatasetCommand,
  SimDescribeDatasetCommandOutput,
  SimListDatasetsCommand,
  SimListDatasetsCommandOutput,
} from "./dataset.command.js";

/**
 * The simulated Personalize dataset commands that only read.
 */
export class SimPersonalizeDatasetReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeDataset command. */
  describe(
    command: SimDescribeDatasetCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeDatasetCommandOutput {
    const dataset = this.resolve(
      this.resources.datasets,
      command.input.datasetArn,
      "personalize:DescribeDataset",
      options,
    );

    return { dataset: simPersonalizeDatasetDetail(dataset), $metadata: {} };
  }

  /**
   * Handle a ListDatasets command.
   *
   * Real Personalize takes the dataset group as a filter rather than as a
   * requirement, and lists every dataset in the Region without one.
   */
  list(
    command: SimListDatasetsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListDatasetsCommandOutput {
    this.authorizer.authorize("personalize:ListDatasets", options);

    const datasetGroupArn = command.input?.datasetGroupArn;
    const matching = this.resources.datasets.all.filter(
      (dataset) =>
        datasetGroupArn === undefined ||
        dataset.datasetGroupArn === datasetGroupArn,
    );
    const page = simPersonalizePageOf(matching, command.input);

    return {
      datasets: page.items.map((dataset) =>
        simPersonalizeDatasetSummary(dataset),
      ),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}
