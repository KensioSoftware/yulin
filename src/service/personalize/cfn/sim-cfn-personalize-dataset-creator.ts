import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPersonalizeDataset } from "../resource/sim-personalize-dataset.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import type { SimPersonalize } from "../sim-personalize.js";
import { simCfnPersonalizeCreated } from "./sim-cfn-personalize-created.js";
import { SimCfnPersonalizeProperties } from "./sim-cfn-personalize-properties.js";
import { simCfnPersonalizeResourceCreation } from "./sim-cfn-personalize-resource-error.js";
import { personalizeDatasetResourceType } from "./sim-cfn-personalize-resource-types.js";

const readProperties = new Set([
  "Name",
  "DatasetType",
  "DatasetGroupArn",
  "SchemaArn",
]);

const unreadProperties = new Map([
  [
    "DatasetImportJob",
    "an import job reads data out of S3, and simulated Personalize reads no " +
      "dataset",
  ],
]);

interface SimCfnPersonalizeDatasetCreatorProperties {
  readonly personalize: SimPersonalize;
  readonly resources: SimPersonalizeResources;
}

/**
 * Creates simulated datasets from AWS::Personalize::Dataset Resources.
 *
 * `DatasetGroupArn` and `SchemaArn` are usually `Fn::GetAtt` on the Resources
 * that made them, which is what puts the three in dependency order. Both are
 * resolved by CreateDataset, so a template naming a group that failed to
 * deploy is refused the way an SDK caller passing the same ARN is.
 */
export class SimCfnPersonalizeDatasetCreator {
  readonly #personalize: SimPersonalize;
  readonly #resources: SimPersonalizeResources;

  constructor(properties: SimCfnPersonalizeDatasetCreatorProperties) {
    this.#personalize = properties.personalize;
    this.#resources = properties.resources;
  }

  /** Create a dataset from an AWS::Personalize::Dataset Resource. */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimPersonalizeDataset> {
    const read = new SimCfnPersonalizeProperties({
      resourceType: personalizeDatasetResourceType,
      resource,
      properties,
      read: readProperties,
      unread: unreadProperties,
    });
    const input = {
      name: read.string("Name"),
      datasetType: read.string("DatasetType"),
      datasetGroupArn: read.string("DatasetGroupArn"),
      schemaArn: read.string("SchemaArn"),
    };

    read.recordUnreadProperties();

    return await simCfnPersonalizeResourceCreation(
      personalizeDatasetResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#personalize.createDataset({ input });

        return simCfnPersonalizeCreated(
          this.#resources.datasets,
          created.datasetArn,
          "dataset",
        );
      },
    );
  }

  /** Delete a dataset an AWS::Personalize::Dataset Resource made. */
  async delete(dataset: SimPersonalizeDataset): Promise<void> {
    await this.#personalize.deleteDataset({
      input: { datasetArn: dataset.arn },
    });
  }
}
