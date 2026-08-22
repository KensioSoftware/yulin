import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimPersonalizeEventRecords } from "../event/sim-personalize-event-records.js";
import { SimPersonalizeResultRules } from "../recommendation/sim-personalize-result-rules.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import { SimPersonalizeAuthorizer } from "./authorize/sim-personalize-authorizer.js";
import { SimPersonalizeCampaignReadCommands } from "./campaign/sim-personalize-campaign-read-commands.js";
import { SimPersonalizeCampaignWriteCommands } from "./campaign/sim-personalize-campaign-write-commands.js";
import { SimPersonalizeDatasetGroupReadCommands } from "./dataset-group/sim-personalize-dataset-group-read-commands.js";
import { SimPersonalizeDatasetGroupWriteCommands } from "./dataset-group/sim-personalize-dataset-group-write-commands.js";
import { SimPersonalizeDatasetReadCommands } from "./dataset/sim-personalize-dataset-read-commands.js";
import { SimPersonalizeDatasetWriteCommands } from "./dataset/sim-personalize-dataset-write-commands.js";
import { SimPersonalizeEventTrackerReadCommands } from "./event-tracker/sim-personalize-event-tracker-read-commands.js";
import { SimPersonalizeEventTrackerWriteCommands } from "./event-tracker/sim-personalize-event-tracker-write-commands.js";
import { SimPersonalizePutEventsHandler } from "./events/sim-personalize-put-events.js";
import { SimPersonalizePutItemsHandler } from "./events/sim-personalize-put-items.js";
import { SimPersonalizePutUsersHandler } from "./events/sim-personalize-put-users.js";
import { SimPersonalizeRecommenderReadCommands } from "./recommender/sim-personalize-recommender-read-commands.js";
import { SimPersonalizeRecommenderWriteCommands } from "./recommender/sim-personalize-recommender-write-commands.js";
import { SimPersonalizeGetPersonalizedRankingHandler } from "./runtime/sim-personalize-get-personalized-ranking.js";
import { SimPersonalizeGetRecommendationsHandler } from "./runtime/sim-personalize-get-recommendations.js";
import { SimPersonalizeSchemaReadCommands } from "./schema/sim-personalize-schema-read-commands.js";
import { SimPersonalizeSchemaWriteCommands } from "./schema/sim-personalize-schema-write-commands.js";
import { SimPersonalizeSolutionReadCommands } from "./solution/sim-personalize-solution-read-commands.js";
import { SimPersonalizeSolutionVersionReadCommands } from "./solution/sim-personalize-solution-version-read-commands.js";
import { SimPersonalizeSolutionVersionWriteCommands } from "./solution/sim-personalize-solution-version-write-commands.js";
import { SimPersonalizeSolutionWriteCommands } from "./solution/sim-personalize-solution-write-commands.js";

interface SimPersonalizeCommandsProperties {
  readonly resources: SimPersonalizeResources;
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * Every simulated Personalize command handler, built over one set of
 * resources.
 *
 * The handlers are grouped by the resource they are about and then split by
 * whether they change anything, and gathered here so the service facade stays
 * a list of the operations it answers.
 *
 * The two runtime handlers are built here as well, over the same resources
 * and the same authorizer. What they answer with is declared against a
 * campaign or a recommender through the rules, so those are held here too. The
 * declaration and the request that reads it have to reach the same rules.
 *
 * The three events handlers are here for the same reason. They record what
 * they are sent, and `SimPersonalize` reads that record back through its own
 * accessors, so both ends have to reach the same records.
 */
export class SimPersonalizeCommands {
  public readonly datasetGroupWrites: SimPersonalizeDatasetGroupWriteCommands;
  public readonly datasetGroupReads: SimPersonalizeDatasetGroupReadCommands;
  public readonly schemaWrites: SimPersonalizeSchemaWriteCommands;
  public readonly schemaReads: SimPersonalizeSchemaReadCommands;
  public readonly datasetWrites: SimPersonalizeDatasetWriteCommands;
  public readonly datasetReads: SimPersonalizeDatasetReadCommands;
  public readonly solutionWrites: SimPersonalizeSolutionWriteCommands;
  public readonly solutionReads: SimPersonalizeSolutionReadCommands;
  public readonly solutionVersionWrites: SimPersonalizeSolutionVersionWriteCommands;
  public readonly solutionVersionReads: SimPersonalizeSolutionVersionReadCommands;
  public readonly campaignWrites: SimPersonalizeCampaignWriteCommands;
  public readonly campaignReads: SimPersonalizeCampaignReadCommands;
  public readonly recommenderWrites: SimPersonalizeRecommenderWriteCommands;
  public readonly recommenderReads: SimPersonalizeRecommenderReadCommands;
  public readonly eventTrackerWrites: SimPersonalizeEventTrackerWriteCommands;
  public readonly eventTrackerReads: SimPersonalizeEventTrackerReadCommands;
  public readonly records = new SimPersonalizeEventRecords();
  public readonly putEvents: SimPersonalizePutEventsHandler;
  public readonly putItems: SimPersonalizePutItemsHandler;
  public readonly putUsers: SimPersonalizePutUsersHandler;
  public readonly rules: SimPersonalizeResultRules;
  public readonly recommendations: SimPersonalizeGetRecommendationsHandler;
  public readonly rankings: SimPersonalizeGetPersonalizedRankingHandler;

  constructor(properties: SimPersonalizeCommandsProperties) {
    const { resources, accountRegionScope, clock } = properties;
    const authorizer = new SimPersonalizeAuthorizer({ iam: properties.iam });
    const shared = { resources, authorizer, accountRegionScope, clock };

    this.datasetGroupWrites = new SimPersonalizeDatasetGroupWriteCommands(
      shared,
    );
    this.datasetGroupReads = new SimPersonalizeDatasetGroupReadCommands(shared);
    this.schemaWrites = new SimPersonalizeSchemaWriteCommands(shared);
    this.schemaReads = new SimPersonalizeSchemaReadCommands(shared);
    this.datasetWrites = new SimPersonalizeDatasetWriteCommands(shared);
    this.datasetReads = new SimPersonalizeDatasetReadCommands(shared);
    this.solutionWrites = new SimPersonalizeSolutionWriteCommands(shared);
    this.solutionReads = new SimPersonalizeSolutionReadCommands(shared);
    this.solutionVersionWrites = new SimPersonalizeSolutionVersionWriteCommands(
      shared,
    );
    this.solutionVersionReads = new SimPersonalizeSolutionVersionReadCommands(
      shared,
    );
    this.campaignWrites = new SimPersonalizeCampaignWriteCommands(shared);
    this.campaignReads = new SimPersonalizeCampaignReadCommands(shared);
    this.recommenderWrites = new SimPersonalizeRecommenderWriteCommands(shared);
    this.recommenderReads = new SimPersonalizeRecommenderReadCommands(shared);
    this.eventTrackerWrites = new SimPersonalizeEventTrackerWriteCommands(
      shared,
    );
    this.eventTrackerReads = new SimPersonalizeEventTrackerReadCommands(shared);

    const events = { ...shared, records: this.records };

    this.putEvents = new SimPersonalizePutEventsHandler(events);
    this.putItems = new SimPersonalizePutItemsHandler(events);
    this.putUsers = new SimPersonalizePutUsersHandler(events);

    this.rules = new SimPersonalizeResultRules({
      campaigns: resources.campaigns,
      recommenders: resources.recommenders,
    });

    const runtime = { ...shared, rules: this.rules };

    this.recommendations = new SimPersonalizeGetRecommendationsHandler(runtime);
    this.rankings = new SimPersonalizeGetPersonalizedRankingHandler(runtime);
  }
}
