import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import type { SimPersonalize } from "../sim-personalize.js";
import { SimCfnPersonalizeDatasetCreator } from "./sim-cfn-personalize-dataset-creator.js";
import { SimCfnPersonalizeDatasetGroupCreator } from "./sim-cfn-personalize-dataset-group-creator.js";
import { SimCfnPersonalizeEventTrackerCreator } from "./sim-cfn-personalize-event-tracker-creator.js";
import {
  personalizeDatasetGroupResourceTypeName,
  personalizeDatasetResourceTypeName,
  personalizeEventTrackerResourceTypeName,
  personalizeSchemaResourceTypeName,
  personalizeSolutionResourceTypeName,
} from "./sim-cfn-personalize-resource-types.js";
import { SimCfnPersonalizeSchemaCreator } from "./sim-cfn-personalize-schema-creator.js";
import { SimCfnPersonalizeSolutionCreator } from "./sim-cfn-personalize-solution-creator.js";

interface SimPersonalizeCfnResourceFactoryProperties {
  readonly personalize: SimPersonalize;
  readonly resources: SimPersonalizeResources;
}

/**
 * What this factory does with one AWS::Personalize::* Resource type.
 *
 * Creating and deleting are held together rather than dispatched apart,
 * because a type this factory can make is exactly a type it has to be able to
 * remove, and two switches would be two places to keep in step.
 */
interface SimCfnPersonalizeResourceHandler {
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<object>;
  delete(resource: SimCfnResource): Promise<void>;
}

/**
 * CloudFormation Resource factory for simulated Personalize resources.
 *
 * Dataset groups, schemas, datasets, solutions and event trackers are the
 * AWS::Personalize::* Resource types this simulation models. They are the five
 * an application declares. The other five types CloudFormation has cover batch
 * inference, batch segments, data deletion, metric attribution and recipes, all
 * of which work over data simulated Personalize never reads. A template
 * declaring one of those is recorded as unsupported and stepped over.
 */
export class SimPersonalizeCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #handlers: ReadonlyMap<string, SimCfnPersonalizeResourceHandler>;

  constructor(properties: SimPersonalizeCfnResourceFactoryProperties) {
    this.#handlers = new Map([
      [
        personalizeDatasetGroupResourceTypeName,
        handler(
          new SimCfnPersonalizeDatasetGroupCreator(properties),
          "dataset group",
        ),
      ],
      [
        personalizeSchemaResourceTypeName,
        handler(new SimCfnPersonalizeSchemaCreator(properties), "schema"),
      ],
      [
        personalizeDatasetResourceTypeName,
        handler(new SimCfnPersonalizeDatasetCreator(properties), "dataset"),
      ],
      [
        personalizeSolutionResourceTypeName,
        handler(new SimCfnPersonalizeSolutionCreator(properties), "solution"),
      ],
      [
        personalizeEventTrackerResourceTypeName,
        handler(
          new SimCfnPersonalizeEventTrackerCreator(properties),
          "event tracker",
        ),
      ],
    ]);
  }

  /**
   * Create a simulated Personalize resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    return await this.handler(resourceTypeName, "").create(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }

  /**
   * Delete a simulated Personalize resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    await this.handler(resourceTypeName, " deletion").delete(resource);
  }

  private handler(
    resourceTypeName: string,
    operationSuffix: string,
  ): SimCfnPersonalizeResourceHandler {
    const handler = this.#handlers.get(resourceTypeName);

    assertDefined(
      handler,
      `Unsupported sim Personalize CloudFormation Resource ` +
        `${resourceTypeName}${operationSuffix}`,
    );

    return handler;
  }
}

/**
 * Adapt one creator to the handler this factory dispatches to.
 *
 * The delete side is where the type comes back. A Resource carries whatever its
 * creator made as an opaque object, and this is the one place that knows which
 * creator made which.
 */
function handler<T extends object>(
  creator: {
    create(
      resource: SimCfnResource,
      properties: SimCfnTemplateValueRecord,
    ): Promise<T>;
    delete(created: T): Promise<void>;
  },
  described: string,
): SimCfnPersonalizeResourceHandler {
  return {
    create: async (resource, properties): Promise<T> =>
      await creator.create(resource, properties),
    delete: async (resource): Promise<void> => {
      await creator.delete(created<T>(resource, described));
    },
  };
}

function created<T extends object>(
  resource: SimCfnResource,
  described: string,
): T {
  const simResource = resource.simResource as T | undefined;

  assertDefined(
    simResource,
    `sim Personalize ${described} for CloudFormation Resource ${
      resource.logicalId
    }`,
  );

  return simResource;
}
