import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import {
  simPersonalizeSolutionSummary,
  simPersonalizeSolutionVersionSummary,
} from "../../view/sim-personalize-solution-view.js";
import type {
  SimDescribeSolutionCommand,
  SimDescribeSolutionCommandOutput,
  SimListSolutionsCommand,
  SimListSolutionsCommandOutput,
} from "./solution.command.js";

/**
 * The simulated Personalize solution commands that only read.
 */
export class SimPersonalizeSolutionReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeSolution command. */
  describe(
    command: SimDescribeSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeSolutionCommandOutput {
    const solution = this.resolve(
      this.resources.solutions,
      command.input.solutionArn,
      "personalize:DescribeSolution",
      options,
    );
    const latest = this.resources.solutionVersions.all.findLast(
      (version) => version.solutionArn === solution.arn,
    );

    return {
      solution: {
        ...simPersonalizeSolutionSummary(solution),
        datasetGroupArn: solution.datasetGroupArn,
        eventType: solution.eventType,
        performAutoML: solution.performAutoML,
        performHPO: solution.performHPO,
        latestSolutionVersion:
          latest === undefined
            ? undefined
            : simPersonalizeSolutionVersionSummary(latest),
      },
      $metadata: {},
    };
  }

  /** Handle a ListSolutions command. */
  list(
    command: SimListSolutionsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListSolutionsCommandOutput {
    this.authorizer.authorize("personalize:ListSolutions", options);

    const datasetGroupArn = command.input?.datasetGroupArn;
    const matching = this.resources.solutions.all.filter(
      (solution) =>
        datasetGroupArn === undefined ||
        solution.datasetGroupArn === datasetGroupArn,
    );
    const page = simPersonalizePageOf(matching, command.input);

    return {
      solutions: page.items.map((solution) =>
        simPersonalizeSolutionSummary(solution),
      ),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}
