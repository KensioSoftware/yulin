import type * as simPersonalizeCommands from "./command/sim-personalize-command.types.js";
import type { SimPersonalizeRequestOptions } from "./command/sim-personalize-request-options.js";
import { SimPersonalizeDataOperations } from "./sim-personalize-data-operations.js";

/**
 * The operations of the Personalize control plane API that are about models.
 *
 * A solution names a recipe on a dataset group, a solution version stands for
 * the trained model, and a campaign deploys that version. These eleven calls
 * build the chain a recommendation is served from, on top of the data
 * operations this extends.
 *
 * The seven recommender calls are the domain path's answer to all of it. A
 * recommender is created straight onto a Domain dataset group for one of the
 * ten use cases, with no solution and no campaign in between.
 *
 * The whole control plane sits apart from `SimPersonalize` because that class
 * would otherwise be this list and nothing else. What is left there is what a
 * simulated Personalize is beyond its control plane. The runtime API over it,
 * the events API over it, the results declared against its campaigns, and the
 * state a test reads back directly.
 *
 * The split from the runtime is the one AWS makes. The control plane is the
 * `personalize` endpoint and the `PersonalizeClient`. The runtime is the
 * `personalize-runtime` endpoint and a client of its own.
 */
export abstract class SimPersonalizeControlPlane extends SimPersonalizeDataOperations {
  /** Handle a CreateSolution Command from the SDK. */
  async createSolution(
    command: simPersonalizeCommands.SimCreateSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateSolutionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionWrites.create(command, options);
  }

  /** Handle a DescribeSolution Command from the SDK. */
  async describeSolution(
    command: simPersonalizeCommands.SimDescribeSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeSolutionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionReads.describe(command, options);
  }

  /** Handle a ListSolutions Command from the SDK. */
  async listSolutions(
    command: simPersonalizeCommands.SimListSolutionsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListSolutionsCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionReads.list(command, options);
  }

  /** Handle a DeleteSolution Command from the SDK. */
  async deleteSolution(
    command: simPersonalizeCommands.SimDeleteSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteSolutionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionWrites.delete(command, options);
  }

  /** Handle a CreateSolutionVersion Command from the SDK. */
  async createSolutionVersion(
    command: simPersonalizeCommands.SimCreateSolutionVersionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateSolutionVersionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionVersionWrites.create(command, options);
  }

  /** Handle a DescribeSolutionVersion Command from the SDK. */
  async describeSolutionVersion(
    command: simPersonalizeCommands.SimDescribeSolutionVersionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeSolutionVersionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionVersionReads.describe(command, options);
  }

  /** Handle a ListSolutionVersions Command from the SDK. */
  async listSolutionVersions(
    command: simPersonalizeCommands.SimListSolutionVersionsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListSolutionVersionsCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionVersionReads.list(command, options);
  }

  /** Handle a CreateCampaign Command from the SDK. */
  async createCampaign(
    command: simPersonalizeCommands.SimCreateCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateCampaignCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignWrites.create(command, options);
  }

  /** Handle a DescribeCampaign Command from the SDK. */
  async describeCampaign(
    command: simPersonalizeCommands.SimDescribeCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeCampaignCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignReads.describe(command, options);
  }

  /** Handle a ListCampaigns Command from the SDK. */
  async listCampaigns(
    command: simPersonalizeCommands.SimListCampaignsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListCampaignsCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignReads.list(command, options);
  }

  /** Handle a DeleteCampaign Command from the SDK. */
  async deleteCampaign(
    command: simPersonalizeCommands.SimDeleteCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteCampaignCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignWrites.delete(command, options);
  }

  /** Handle a CreateRecommender Command from the SDK. */
  async createRecommender(
    command: simPersonalizeCommands.SimCreateRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateRecommenderCommandOutput> {
    await this.background.sequence();
    return this.commands.recommenderWrites.create(command, options);
  }

  /** Handle a DescribeRecommender Command from the SDK. */
  async describeRecommender(
    command: simPersonalizeCommands.SimDescribeRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeRecommenderCommandOutput> {
    await this.background.sequence();
    return this.commands.recommenderReads.describe(command, options);
  }

  /** Handle a ListRecommenders Command from the SDK. */
  async listRecommenders(
    command: simPersonalizeCommands.SimListRecommendersCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListRecommendersCommandOutput> {
    await this.background.sequence();
    return this.commands.recommenderReads.list(command, options);
  }

  /** Handle an UpdateRecommender Command from the SDK. */
  async updateRecommender(
    command: simPersonalizeCommands.SimUpdateRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimUpdateRecommenderCommandOutput> {
    await this.background.sequence();
    return this.commands.recommenderWrites.update(command, options);
  }

  /** Handle a DeleteRecommender Command from the SDK. */
  async deleteRecommender(
    command: simPersonalizeCommands.SimDeleteRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteRecommenderCommandOutput> {
    await this.background.sequence();
    return this.commands.recommenderWrites.delete(command, options);
  }

  /** Handle a StartRecommender Command from the SDK. */
  async startRecommender(
    command: simPersonalizeCommands.SimStartRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimStartRecommenderCommandOutput> {
    await this.background.sequence();
    return this.commands.recommenderWrites.start(command, options);
  }

  /** Handle a StopRecommender Command from the SDK. */
  async stopRecommender(
    command: simPersonalizeCommands.SimStopRecommenderCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimStopRecommenderCommandOutput> {
    await this.background.sequence();
    return this.commands.recommenderWrites.stop(command, options);
  }
}
