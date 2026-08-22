import { simPersonalizeRecommenderDetail } from "../../view/sim-personalize-recommender-view.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimDescribeRecommenderCommand,
  SimDescribeRecommenderCommandOutput,
  SimListRecommendersCommand,
  SimListRecommendersCommandOutput,
} from "./recommender.command.js";

/**
 * The simulated Personalize recommender commands that only read.
 */
export class SimPersonalizeRecommenderReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeRecommender command. */
  describe(
    command: SimDescribeRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeRecommenderCommandOutput {
    const recommender = this.resolve(
      this.resources.recommenders,
      command.input.recommenderArn,
      "personalize:DescribeRecommender",
      options,
    );

    return {
      recommender: simPersonalizeRecommenderDetail(recommender),
      $metadata: {},
    };
  }

  /** Handle a ListRecommenders command, filtered by dataset group. */
  list(
    command: SimListRecommendersCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListRecommendersCommandOutput {
    this.authorizer.authorize("personalize:ListRecommenders", options);

    const datasetGroupArn = command.input?.datasetGroupArn;
    const matching = this.resources.recommenders.all.filter(
      (recommender) =>
        datasetGroupArn === undefined ||
        recommender.datasetGroupArn === datasetGroupArn,
    );
    const page = simPersonalizePageOf(matching, command.input);

    return {
      recommenders: page.items.map((recommender) =>
        simPersonalizeRecommenderDetail(recommender),
      ),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}
