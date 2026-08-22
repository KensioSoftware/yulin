import type { SimPersonalizeResource } from "./sim-personalize-resource.js";
import {
  simPersonalizeActiveStatus,
  simPersonalizeInactiveStatus,
} from "./sim-personalize-status.js";
import type { SimPersonalizeUseCase } from "./sim-personalize-use-case.js";

/**
 * The configuration a recommender carries and reports back.
 *
 * Held as the record the request gave. `itemExplorationConfig` tunes how much
 * a real recommender explores less relevant items, and nothing here explores.
 */
export interface SimPersonalizeRecommenderConfig {
  readonly itemExplorationConfig?: Record<string, string> | undefined;
  readonly minRecommendationRequestsPerSecond?: number | undefined;
  readonly enableMetadataWithRecommendations?: boolean | undefined;
}

export interface SimPersonalizeRecommenderProperties {
  readonly arn: string;
  readonly name: string;
  readonly creationDateTime: Date;
  readonly datasetGroupArn: string;
  readonly useCase: SimPersonalizeUseCase;
  readonly recommenderConfig?: SimPersonalizeRecommenderConfig | undefined;
}

/**
 * A simulated Personalize recommender: the endpoint the domain path serves
 * recommendations from.
 *
 * It stands where a campaign stands on the custom path. An application on the
 * domain path calls `GetRecommendations` with a `recommenderArn` and creates
 * no solution and no campaign at all.
 *
 * The use case behind it is the one thing that changes what a request may look
 * like. `Top picks for you` needs a user and `More like X` needs an item, and
 * a request missing what its use case needs is refused here as it is on AWS.
 */
export class SimPersonalizeRecommender implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly creationDateTime: Date;
  public readonly datasetGroupArn: string;
  public readonly useCase: SimPersonalizeUseCase;
  public status: string = simPersonalizeActiveStatus;
  public lastUpdatedDateTime: Date;
  public recommenderConfig: SimPersonalizeRecommenderConfig;

  constructor(properties: SimPersonalizeRecommenderProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.datasetGroupArn = properties.datasetGroupArn;
    this.useCase = properties.useCase;
    this.recommenderConfig = properties.recommenderConfig ?? {};
  }

  /** The recipe ARN of the use case this recommender was created for. */
  get recipeArn(): string {
    return this.useCase.recipeArn;
  }

  /** Whether this recommender is serving recommendations. */
  get active(): boolean {
    return this.status === simPersonalizeActiveStatus;
  }

  /**
   * Stop serving recommendations, as StopRecommender does.
   *
   * Real Personalize walks through `STOP PENDING` and `STOP IN_PROGRESS` on
   * the way, and stops billing once it lands. This lands straight away, on the
   * same reasoning as every other status here.
   */
  stop(now: Date): void {
    this.status = simPersonalizeInactiveStatus;
    this.lastUpdatedDateTime = now;
  }

  /** Serve recommendations again, as StartRecommender does. */
  start(now: Date): void {
    this.status = simPersonalizeActiveStatus;
    this.lastUpdatedDateTime = now;
  }

  /** Replace the configuration, as UpdateRecommender does. */
  configure(
    recommenderConfig: SimPersonalizeRecommenderConfig,
    now: Date,
  ): void {
    this.recommenderConfig = recommenderConfig;
    this.lastUpdatedDateTime = now;
  }
}
