import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import type { SimPersonalizeSchema } from "../resource/sim-personalize-schema.js";
import type { SimPersonalize } from "../sim-personalize.js";
import { simCfnPersonalizeCreated } from "./sim-cfn-personalize-created.js";
import { SimCfnPersonalizeProperties } from "./sim-cfn-personalize-properties.js";
import { simCfnPersonalizeResourceCreation } from "./sim-cfn-personalize-resource-error.js";
import { personalizeSchemaResourceType } from "./sim-cfn-personalize-resource-types.js";

const readProperties = new Set(["Name", "Schema", "Domain"]);

interface SimCfnPersonalizeSchemaCreatorProperties {
  readonly personalize: SimPersonalize;
  readonly resources: SimPersonalizeResources;
}

/**
 * Creates simulated schemas from AWS::Personalize::Schema Resources.
 *
 * `Schema` is the Avro document, written in a template as a JSON string. It is
 * held as the string it arrived as and never parsed, the same as one an SDK
 * caller passes to CreateSchema.
 */
export class SimCfnPersonalizeSchemaCreator {
  readonly #personalize: SimPersonalize;
  readonly #resources: SimPersonalizeResources;

  constructor(properties: SimCfnPersonalizeSchemaCreatorProperties) {
    this.#personalize = properties.personalize;
    this.#resources = properties.resources;
  }

  /** Create a schema from an AWS::Personalize::Schema Resource. */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimPersonalizeSchema> {
    const read = new SimCfnPersonalizeProperties({
      resourceType: personalizeSchemaResourceType,
      resource,
      properties,
      read: readProperties,
    });
    const input = {
      name: read.string("Name"),
      schema: read.string("Schema"),
      domain: read.string("Domain"),
    };

    read.recordUnreadProperties();

    return await simCfnPersonalizeResourceCreation(
      personalizeSchemaResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#personalize.createSchema({ input });

        return simCfnPersonalizeCreated(
          this.#resources.schemas,
          created.schemaArn,
          "schema",
        );
      },
    );
  }

  /** Delete a schema an AWS::Personalize::Schema Resource made. */
  async delete(schema: SimPersonalizeSchema): Promise<void> {
    await this.#personalize.deleteSchema({ input: { schemaArn: schema.arn } });
  }
}
