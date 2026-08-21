import { simPersonalizeDatasetGroupArn } from "../../resource/sim-personalize-arn.js";
import { requireDatasetGroupEmpty } from "../../resource/sim-personalize-in-use.js";
import { SimPersonalizeDatasetGroup } from "../../resource/sim-personalize-dataset-group.js";
import { readSimPersonalizeDomain } from "../../resource/sim-personalize-domain.js";
import { requireSimPersonalizeName } from "../../resource/sim-personalize-name.js";
import { simPersonalizeActiveStatus } from "../../resource/sim-personalize-status.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateDatasetGroupCommand,
  SimCreateDatasetGroupCommandOutput,
  SimDeleteDatasetGroupCommand,
  SimDeleteDatasetGroupCommandOutput,
} from "./dataset-group.command.js";

/**
 * The simulated Personalize dataset group commands that change state.
 *
 * A dataset group is the container everything else hangs off, so it is the
 * first thing a caller creates and the last thing it deletes.
 */
export class SimPersonalizeDatasetGroupWriteCommands extends SimPersonalizeCommandGroup {
  /** Handle a CreateDatasetGroup command. */
  create(
    command: SimCreateDatasetGroupCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateDatasetGroupCommandOutput {
    this.authorizer.authorize("personalize:CreateDatasetGroup", options);

    const { input } = command;
    const name = requireSimPersonalizeName(input.name, "dataset group");
    const domain = readSimPersonalizeDomain(input.domain);

    this.resources.datasetGroups.requireNameAvailable(name);

    const datasetGroup = new SimPersonalizeDatasetGroup({
      arn: simPersonalizeDatasetGroupArn(name, this.accountRegionScope),
      name,
      status: simPersonalizeActiveStatus,
      creationDateTime: this.clock.now(),
      domain,
      kmsKeyArn: input.kmsKeyArn,
      roleArn: input.roleArn,
    });

    this.resources.datasetGroups.add(datasetGroup);

    return {
      datasetGroupArn: datasetGroup.arn,
      domain: datasetGroup.domain,
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteDatasetGroup command.
   *
   * Real Personalize requires the datasets and solutions in a group to be gone
   * before the group itself can be, and reports one that still holds them as
   * in use.
   */
  delete(
    command: SimDeleteDatasetGroupCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDeleteDatasetGroupCommandOutput {
    const datasetGroup = this.resolve(
      this.resources.datasetGroups,
      command.input.datasetGroupArn,
      "personalize:DeleteDatasetGroup",
      options,
    );

    requireDatasetGroupEmpty(this.resources, datasetGroup.arn);
    this.resources.datasetGroups.remove(datasetGroup);

    return { $metadata: {} };
  }
}
