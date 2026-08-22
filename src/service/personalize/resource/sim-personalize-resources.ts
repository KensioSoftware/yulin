import type { SimPersonalizeCampaign } from "./sim-personalize-campaign.js";
import type { SimPersonalizeDatasetGroup } from "./sim-personalize-dataset-group.js";
import type { SimPersonalizeDataset } from "./sim-personalize-dataset.js";
import type { SimPersonalizeEventTracker } from "./sim-personalize-event-tracker.js";
import { SimPersonalizeResourceStore } from "./sim-personalize-resource-store.js";
import type { SimPersonalizeSchema } from "./sim-personalize-schema.js";
import type { SimPersonalizeSolutionVersion } from "./sim-personalize-solution-version.js";
import type { SimPersonalizeSolution } from "./sim-personalize-solution.js";

/**
 * Every resource one simulated Personalize scope holds, by type.
 *
 * The stores are gathered here rather than on the service facade because most
 * commands read more than one of them. Creating a dataset reaches its dataset
 * group and its schema, and creating a campaign reaches a solution version and
 * through it a solution.
 */
export class SimPersonalizeResources {
  public readonly datasetGroups =
    new SimPersonalizeResourceStore<SimPersonalizeDatasetGroup>({
      description: "dataset group",
    });

  public readonly schemas =
    new SimPersonalizeResourceStore<SimPersonalizeSchema>({
      description: "schema",
    });

  public readonly datasets =
    new SimPersonalizeResourceStore<SimPersonalizeDataset>({
      description: "dataset",
    });

  public readonly solutions =
    new SimPersonalizeResourceStore<SimPersonalizeSolution>({
      description: "solution",
    });

  public readonly solutionVersions =
    new SimPersonalizeResourceStore<SimPersonalizeSolutionVersion>({
      description: "solution version",
    });

  public readonly campaigns =
    new SimPersonalizeResourceStore<SimPersonalizeCampaign>({
      description: "campaign",
    });

  public readonly eventTrackers =
    new SimPersonalizeResourceStore<SimPersonalizeEventTracker>({
      description: "event tracker",
      article: "An",
    });
}
