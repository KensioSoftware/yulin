import { SimPersonalizeResourceAlreadyExistsException } from "../../error/sim-personalize.error.js";
import { simPersonalizeDatasetArn } from "../../resource/sim-personalize-arn.js";
import {
  requireDatasetTypeAllowed,
  requireSimPersonalizeDatasetType,
} from "../../resource/sim-personalize-dataset-type.js";
import { SimPersonalizeDataset } from "../../resource/sim-personalize-dataset.js";
import { requireSimPersonalizeName } from "../../resource/sim-personalize-name.js";
import { simPersonalizeActiveStatus } from "../../resource/sim-personalize-status.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateDatasetCommand,
  SimCreateDatasetCommandOutput,
  SimDeleteDatasetCommand,
  SimDeleteDatasetCommandOutput,
} from "./dataset.command.js";

/**
 * The simulated Personalize dataset commands that change state.
 *
 * A dataset is empty for its whole life here. Real datasets are empty on
 * creation too, and fill up through a dataset import job or the events API,
 * neither of which this simulates.
 */
export class SimPersonalizeDatasetWriteCommands extends SimPersonalizeCommandGroup {
  /**
   * Handle a CreateDataset command.
   *
   * The dataset ARN carries the dataset group and the type in place of the
   * name the request gave, which is how real Personalize builds it and why one
   * dataset group holds one dataset of each type.
   */
  create(
    command: SimCreateDatasetCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateDatasetCommandOutput {
    this.authorizer.authorize("personalize:CreateDataset", options);

    const { input } = command;
    const name = requireSimPersonalizeName(input.name, "dataset");
    const datasetType = requireSimPersonalizeDatasetType(input.datasetType);
    const datasetGroup = this.resources.datasetGroups.require(
      input.datasetGroupArn,
    );
    const schema = this.resources.schemas.require(input.schemaArn);

    requireDatasetTypeAllowed(datasetType, datasetGroup.domain);

    const arn = simPersonalizeDatasetArn(
      datasetGroup.name,
      datasetType,
      this.accountRegionScope,
    );

    if (this.resources.datasets.find(arn) !== undefined) {
      throw new SimPersonalizeResourceAlreadyExistsException(
        `The dataset group '${datasetGroup.name}' already holds a ` +
          `${datasetType} dataset`,
      );
    }

    const dataset = new SimPersonalizeDataset({
      arn,
      name,
      status: simPersonalizeActiveStatus,
      creationDateTime: this.clock.now(),
      datasetGroupArn: datasetGroup.arn,
      datasetType,
      schemaArn: schema.arn,
    });

    this.resources.datasets.add(dataset);

    return { datasetArn: dataset.arn, $metadata: {} };
  }

  /** Handle a DeleteDataset command. */
  delete(
    command: SimDeleteDatasetCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDeleteDatasetCommandOutput {
    this.resources.datasets.remove(
      this.resolve(
        this.resources.datasets,
        command.input.datasetArn,
        "personalize:DeleteDataset",
        options,
      ),
    );

    return { $metadata: {} };
  }
}
