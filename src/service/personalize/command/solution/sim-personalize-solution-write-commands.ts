import { simPersonalizeSolutionArn } from "../../resource/sim-personalize-arn.js";
import { requireSolutionUndeployed } from "../../resource/sim-personalize-in-use.js";
import { requireSimPersonalizeName } from "../../resource/sim-personalize-name.js";
import { simPersonalizeActiveStatus } from "../../resource/sim-personalize-status.js";
import { SimPersonalizeSolution } from "../../resource/sim-personalize-solution.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateSolutionCommand,
  SimCreateSolutionCommandOutput,
  SimDeleteSolutionCommand,
  SimDeleteSolutionCommandOutput,
} from "./solution.command.js";

/**
 * The simulated Personalize solution commands that change state.
 *
 * The recipe a solution names is recorded and never looked up. No model is
 * fitted, so one recipe behaves like another until domain recommenders arrive
 * and the use case starts deciding what a recommendation request carries.
 */
export class SimPersonalizeSolutionWriteCommands extends SimPersonalizeCommandGroup {
  /** Handle a CreateSolution command. */
  create(
    command: SimCreateSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateSolutionCommandOutput {
    this.authorizer.authorize("personalize:CreateSolution", options);

    const { input } = command;
    const name = requireSimPersonalizeName(input.name, "solution");
    const datasetGroup = this.resources.datasetGroups.require(
      input.datasetGroupArn,
    );

    this.resources.solutions.requireNameAvailable(name);

    const solution = new SimPersonalizeSolution({
      arn: simPersonalizeSolutionArn(name, this.accountRegionScope),
      name,
      status: simPersonalizeActiveStatus,
      creationDateTime: this.clock.now(),
      datasetGroupArn: datasetGroup.arn,
      recipeArn: input.recipeArn,
      eventType: input.eventType,
      performAutoML: input.performAutoML,
      performHPO: input.performHPO,
    });

    this.resources.solutions.add(solution);

    return { solutionArn: solution.arn, $metadata: {} };
  }

  /**
   * Handle a DeleteSolution command.
   *
   * Deleting a solution takes its versions with it, which is how real
   * Personalize behaves. A version has no delete of its own. A campaign still
   * deployed on one of those versions holds the solution in use.
   */
  delete(
    command: SimDeleteSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDeleteSolutionCommandOutput {
    const solution = this.resolve(
      this.resources.solutions,
      command.input.solutionArn,
      "personalize:DeleteSolution",
      options,
    );
    const versions = requireSolutionUndeployed(this.resources, solution.arn);

    for (const version of versions) {
      this.resources.solutionVersions.remove(version);
    }

    this.resources.solutions.remove(solution);

    return { $metadata: {} };
  }
}
