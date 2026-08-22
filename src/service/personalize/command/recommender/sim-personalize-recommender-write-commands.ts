import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";
import { simPersonalizeRecommenderArn } from "../../resource/sim-personalize-arn.js";
import { requireSimPersonalizeName } from "../../resource/sim-personalize-name.js";
import { SimPersonalizeRecommender } from "../../resource/sim-personalize-recommender.js";
import { requireSimPersonalizeUseCase } from "../../resource/sim-personalize-use-case-recipe.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateRecommenderCommand,
  SimCreateRecommenderCommandOutput,
  SimDeleteRecommenderCommand,
  SimDeleteRecommenderCommandOutput,
  SimStartRecommenderCommand,
  SimStartRecommenderCommandOutput,
  SimStopRecommenderCommand,
  SimStopRecommenderCommandOutput,
  SimUpdateRecommenderCommand,
  SimUpdateRecommenderCommandOutput,
} from "./recommender.command.js";

/**
 * The simulated Personalize recommender commands that change state.
 *
 * A recommender is the domain path's answer to a campaign. It is created
 * directly on a Domain dataset group for one of the ten use cases, with no
 * solution and no solution version in between.
 */
export class SimPersonalizeRecommenderWriteCommands extends SimPersonalizeCommandGroup {
  /**
   * Handle a CreateRecommender command.
   *
   * The dataset group has to carry a domain. A recommender on a custom dataset
   * group is the mistake this catches, and real Personalize refuses it too.
   */
  create(
    command: SimCreateRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateRecommenderCommandOutput {
    this.authorizer.authorize("personalize:CreateRecommender", options);

    const { input } = command;
    const name = requireSimPersonalizeName(input.name, "recommender");
    const datasetGroup = this.resources.datasetGroups.require(
      input.datasetGroupArn,
    );

    if (datasetGroup.domain === undefined) {
      throw new SimPersonalizeInvalidInputException(
        `The dataset group '${datasetGroup.arn}' has no domain. A ` +
          `recommender belongs to a Domain dataset group, and a custom ` +
          `dataset group serves recommendations through a campaign.`,
      );
    }

    const useCase = requireSimPersonalizeUseCase(
      input.recipeArn,
      datasetGroup.domain,
    );

    this.resources.recommenders.requireNameAvailable(name);

    const recommender = new SimPersonalizeRecommender({
      arn: simPersonalizeRecommenderArn(name, this.accountRegionScope),
      name,
      creationDateTime: this.clock.now(),
      datasetGroupArn: datasetGroup.arn,
      useCase,
      recommenderConfig: input.recommenderConfig,
    });

    this.resources.recommenders.add(recommender);

    return { recommenderArn: recommender.arn, $metadata: {} };
  }

  /**
   * Handle an UpdateRecommender command.
   *
   * The configuration is replaced whole, which is what real Personalize does
   * with the one it is given.
   */
  update(
    command: SimUpdateRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimUpdateRecommenderCommandOutput {
    const recommender = this.recommender(
      command.input.recommenderArn,
      "personalize:UpdateRecommender",
      options,
    );

    recommender.configure(
      command.input.recommenderConfig ?? {},
      this.clock.now(),
    );

    return { recommenderArn: recommender.arn, $metadata: {} };
  }

  /** Handle a DeleteRecommender command. */
  delete(
    command: SimDeleteRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDeleteRecommenderCommandOutput {
    this.resources.recommenders.remove(
      this.recommender(
        command.input.recommenderArn,
        "personalize:DeleteRecommender",
        options,
      ),
    );

    return { $metadata: {} };
  }

  /** Handle a StartRecommender command. */
  start(
    command: SimStartRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimStartRecommenderCommandOutput {
    const recommender = this.recommender(
      command.input.recommenderArn,
      "personalize:StartRecommender",
      options,
    );

    recommender.start(this.clock.now());

    return { recommenderArn: recommender.arn, $metadata: {} };
  }

  /**
   * Handle a StopRecommender command.
   *
   * A stopped recommender keeps everything declared against it. Starting it
   * again serves the same recommendations, which is what a real one does after
   * it comes back.
   */
  stop(
    command: SimStopRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimStopRecommenderCommandOutput {
    const recommender = this.recommender(
      command.input.recommenderArn,
      "personalize:StopRecommender",
      options,
    );

    recommender.stop(this.clock.now());

    return { recommenderArn: recommender.arn, $metadata: {} };
  }

  private recommender(
    recommenderArn: string | undefined,
    action: string,
    options: SimPersonalizeRequestOptions | undefined,
  ): SimPersonalizeRecommender {
    return this.resolve(
      this.resources.recommenders,
      recommenderArn,
      action,
      options,
    );
  }
}
