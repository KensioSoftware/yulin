import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import {
  simPersonalizeDatasetGroupDetail,
  simPersonalizeDatasetGroupSummary,
} from "../../view/sim-personalize-dataset-group-view.js";
import type {
  SimDescribeDatasetGroupCommand,
  SimDescribeDatasetGroupCommandOutput,
  SimListDatasetGroupsCommand,
  SimListDatasetGroupsCommandOutput,
} from "./dataset-group.command.js";

/**
 * The simulated Personalize dataset group commands that only read.
 */
export class SimPersonalizeDatasetGroupReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeDatasetGroup command. */
  describe(
    command: SimDescribeDatasetGroupCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeDatasetGroupCommandOutput {
    const datasetGroup = this.resolve(
      this.resources.datasetGroups,
      command.input.datasetGroupArn,
      "personalize:DescribeDatasetGroup",
      options,
    );

    return {
      datasetGroup: simPersonalizeDatasetGroupDetail(datasetGroup),
      $metadata: {},
    };
  }

  /** Handle a ListDatasetGroups command. */
  list(
    command: SimListDatasetGroupsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListDatasetGroupsCommandOutput {
    this.authorizer.authorize("personalize:ListDatasetGroups", options);

    const page = simPersonalizePageOf(
      this.resources.datasetGroups.all,
      command.input,
    );

    return {
      datasetGroups: page.items.map((group) =>
        simPersonalizeDatasetGroupSummary(group),
      ),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}
