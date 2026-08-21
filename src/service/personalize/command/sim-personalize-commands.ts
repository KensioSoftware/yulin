import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import { SimPersonalizeAuthorizer } from "./authorize/sim-personalize-authorizer.js";
import { SimPersonalizeCampaignReadCommands } from "./campaign/sim-personalize-campaign-read-commands.js";
import { SimPersonalizeCampaignWriteCommands } from "./campaign/sim-personalize-campaign-write-commands.js";
import { SimPersonalizeDatasetGroupReadCommands } from "./dataset-group/sim-personalize-dataset-group-read-commands.js";
import { SimPersonalizeDatasetGroupWriteCommands } from "./dataset-group/sim-personalize-dataset-group-write-commands.js";
import { SimPersonalizeDatasetReadCommands } from "./dataset/sim-personalize-dataset-read-commands.js";
import { SimPersonalizeDatasetWriteCommands } from "./dataset/sim-personalize-dataset-write-commands.js";
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
  }
}
