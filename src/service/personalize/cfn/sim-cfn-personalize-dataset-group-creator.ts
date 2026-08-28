import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPersonalizeDatasetGroup } from "../resource/sim-personalize-dataset-group.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import type { SimPersonalize } from "../sim-personalize.js";
import { simCfnPersonalizeCreated } from "./sim-cfn-personalize-created.js";
import { SimCfnPersonalizeProperties } from "./sim-cfn-personalize-properties.js";
import { simCfnPersonalizeResourceCreation } from "./sim-cfn-personalize-resource-error.js";
import { personalizeDatasetGroupResourceType } from "./sim-cfn-personalize-resource-types.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

const readProperties = new Set(["Name", "Domain", "KmsKeyArn", "RoleArn"]);

const unreadProperties = new Map([
  ["Tags", "no simulated service reads a Personalize resource tag"],
]);

interface SimCfnPersonalizeDatasetGroupCreatorProperties {
  readonly personalize: SimPersonalize;
  readonly resources: SimPersonalizeResources;
}

/**
 * Creates simulated dataset groups from AWS::Personalize::DatasetGroup
 * Resources.
 *
 * The group is created through the ordinary CreateDatasetGroup command rather
 * than constructed directly, so one a template deployed is the same thing an
 * SDK caller would have got. The same name rules, the same refusal of a domain
 * Personalize does not have, and the same ARN.
 */
export class SimCfnPersonalizeDatasetGroupCreator {
  readonly #personalize: SimPersonalize;
  readonly #resources: SimPersonalizeResources;

  constructor(properties: SimCfnPersonalizeDatasetGroupCreatorProperties) {
    this.#personalize = properties.personalize;
    this.#resources = properties.resources;
  }

  /** Create a dataset group from an AWS::Personalize::DatasetGroup Resource. */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimPersonalizeDatasetGroup> {
    const read = new SimCfnPersonalizeProperties({
      resourceType: personalizeDatasetGroupResourceType,
      resource,
      properties,
      read: readProperties,
      unread: unreadProperties,
    });
    const input = {
      name: read.string("Name"),
      domain: read.string("Domain"),
      kmsKeyArn: read.string("KmsKeyArn"),
      roleArn: read.string("RoleArn"),
    };

    read.recordUnreadProperties();

    return await simCfnPersonalizeResourceCreation(
      personalizeDatasetGroupResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#personalize.createDatasetGroup(
          { input },
          options,
        );

        return simCfnPersonalizeCreated(
          this.#resources.datasetGroups,
          created.datasetGroupArn,
          "dataset group",
        );
      },
    );
  }

  /** Delete a dataset group an AWS::Personalize::DatasetGroup Resource made. */
  async delete(
    datasetGroup: SimPersonalizeDatasetGroup,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#personalize.deleteDatasetGroup(
      { input: { datasetGroupArn: datasetGroup.arn } },
      options,
    );
  }
}
