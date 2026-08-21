import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import {
  simPersonalizeSolutionVersionDetail,
  simPersonalizeSolutionVersionSummary,
} from "../../view/sim-personalize-solution-view.js";
import type {
  SimDescribeSolutionVersionCommand,
  SimDescribeSolutionVersionCommandOutput,
  SimListSolutionVersionsCommand,
  SimListSolutionVersionsCommandOutput,
} from "./solution.command.js";

/**
 * The simulated Personalize solution version commands that only read.
 */
export class SimPersonalizeSolutionVersionReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeSolutionVersion command. */
  describe(
    command: SimDescribeSolutionVersionCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeSolutionVersionCommandOutput {
    const version = this.resolve(
      this.resources.solutionVersions,
      command.input.solutionVersionArn,
      "personalize:DescribeSolutionVersion",
      options,
    );

    return {
      solutionVersion: simPersonalizeSolutionVersionDetail(
        version,
        this.resources.solutions.find(version.solutionArn),
      ),
      $metadata: {},
    };
  }

  /** Handle a ListSolutionVersions command. */
  list(
    command: SimListSolutionVersionsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListSolutionVersionsCommandOutput {
    this.authorizer.authorize("personalize:ListSolutionVersions", options);

    const solutionArn = command.input?.solutionArn;
    const matching = this.resources.solutionVersions.all.filter(
      (version) =>
        solutionArn === undefined || version.solutionArn === solutionArn,
    );
    const page = simPersonalizePageOf(matching, command.input);

    return {
      solutionVersions: page.items.map((version) =>
        simPersonalizeSolutionVersionSummary(version),
      ),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}
