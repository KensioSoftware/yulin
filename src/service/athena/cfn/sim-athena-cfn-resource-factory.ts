import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimAthena } from "../sim-athena.js";
import { SimCfnAthenaNamedQueryCreator } from "./named-query/sim-cfn-athena-named-query-creator.js";
import {
  athenaNamedQueryResourceTypeName,
  athenaWorkGroupResourceTypeName,
} from "./sim-cfn-athena-resource-types.js";
import { SimCfnAthenaWorkGroupCreator } from "./work-group/sim-cfn-athena-work-group-creator.js";

interface SimAthenaCfnResourceFactoryProperties {
  readonly athena: SimAthena;
}

/**
 * What this factory does with one AWS::Athena::* Resource type.
 *
 * Creating and deleting are held together rather than dispatched apart,
 * because a type this factory can make is exactly a type it has to be able to
 * remove, and two switches would be two places to keep in step.
 */
interface SimCfnAthenaResourceHandler {
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<object>;
  delete(resource: SimCfnResource): Promise<void>;
}

/**
 * CloudFormation Resource factory for simulated Athena resources.
 *
 * Workgroups and named queries are the AWS::Athena::* Resource types this
 * simulation models. Data catalogs, prepared statements and capacity
 * reservations need machinery it does not have, so a template declaring one is
 * reported as unsupported rather than quietly treated as deployed.
 */
export class SimAthenaCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #handlers: ReadonlyMap<string, SimCfnAthenaResourceHandler>;

  constructor(properties: SimAthenaCfnResourceFactoryProperties) {
    const { athena } = properties;

    this.#handlers = new Map([
      [
        athenaWorkGroupResourceTypeName,
        handler(new SimCfnAthenaWorkGroupCreator({ athena }), "workgroup"),
      ],
      [
        athenaNamedQueryResourceTypeName,
        handler(new SimCfnAthenaNamedQueryCreator({ athena }), "named query"),
      ],
    ]);
  }

  /**
   * Create a simulated Athena resource from a CloudFormation Resource.
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
   * Delete a simulated Athena resource created from a CloudFormation Resource.
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
  ): SimCfnAthenaResourceHandler {
    const handler = this.#handlers.get(resourceTypeName);

    assertDefined(
      handler,
      `Unsupported sim Athena CloudFormation Resource ` +
        `${resourceTypeName}${operationSuffix}`,
    );

    return handler;
  }
}

/**
 * Adapt one creator to the handler this factory dispatches to.
 *
 * The delete side is where the type comes back. A Resource carries whatever
 * its creator made as an opaque object, and this is the one place that knows
 * which creator made which.
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
): SimCfnAthenaResourceHandler {
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
    `sim Athena ${described} for CloudFormation Resource ${resource.logicalId}`,
  );

  return simResource;
}
