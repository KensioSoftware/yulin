import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";
import { simPersonalizeSolutionVersionArn } from "../../resource/sim-personalize-arn.js";
import { simPersonalizeActiveStatus } from "../../resource/sim-personalize-status.js";
import { SimPersonalizeSolutionVersion } from "../../resource/sim-personalize-solution-version.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateSolutionVersionCommand,
  SimCreateSolutionVersionCommandOutput,
} from "./solution.command.js";

/**
 * The training modes real Personalize accepts.
 */
const trainingModes = new Set(["FULL", "UPDATE", "AUTOTRAIN"]);

const defaultTrainingMode = "FULL";

/**
 * The simulated Personalize solution version command that changes state.
 *
 * A version has no delete of its own on real Personalize either. Deleting the
 * solution takes its versions with it.
 */
export class SimPersonalizeSolutionVersionWriteCommands extends SimPersonalizeCommandGroup {
  /**
   * Handle a CreateSolutionVersion command.
   *
   * The version is `ACTIVE` as soon as it exists. Real Personalize spends tens
   * of minutes fitting a model and reports `CREATE PENDING` until it finishes,
   * and a test waiting that out here would be waiting on nothing.
   *
   * The version id is a count where real Personalize generates an opaque
   * string, so a test can write down the ARN it expects.
   */
  create(
    command: SimCreateSolutionVersionCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateSolutionVersionCommandOutput {
    const { input } = command;
    const solution = this.resolve(
      this.resources.solutions,
      input.solutionArn,
      "personalize:CreateSolutionVersion",
      options,
    );
    const trainingMode = input.trainingMode ?? defaultTrainingMode;

    if (!trainingModes.has(trainingMode)) {
      throw new SimPersonalizeInvalidInputException(
        `'${trainingMode}' is not a Personalize training mode. The modes are ` +
          `${[...trainingModes].join(", ")}.`,
      );
    }

    const existing = this.resources.solutionVersions.all.filter(
      (version) => version.solutionArn === solution.arn,
    );
    const versionId = String(existing.length + 1);
    const version = new SimPersonalizeSolutionVersion({
      arn: simPersonalizeSolutionVersionArn(solution.arn, versionId),
      name: input.name ?? `${solution.name}-${versionId}`,
      status: simPersonalizeActiveStatus,
      creationDateTime: this.clock.now(),
      solutionArn: solution.arn,
      trainingMode,
    });

    this.resources.solutionVersions.add(version);

    return { solutionVersionArn: version.arn, $metadata: {} };
  }
}
