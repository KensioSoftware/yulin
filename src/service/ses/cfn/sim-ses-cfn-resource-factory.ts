import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import {
  simCfnResourceCallerOptions,
  type SimCfnResourceCallerOptions,
} from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSesV2 } from "../sim-ses-v2.js";
import { SimCfnSesConfigurationSetCreator } from "./configuration-set/sim-cfn-ses-configuration-set-creator.js";
import { SimCfnSesIdentityCreator } from "./identity/sim-cfn-ses-identity-creator.js";
import {
  sesConfigurationSetResourceTypeName,
  sesEmailIdentityResourceTypeName,
  sesTemplateResourceTypeName,
} from "./sim-cfn-ses-resource-types.js";
import { SimCfnSesTemplateCreator } from "./template/sim-cfn-ses-template-creator.js";

interface SimSesCfnResourceFactoryProperties {
  readonly ses: SimSesV2;
}

/**
 * What this factory does with one AWS::SES::* Resource type.
 *
 * Creating and deleting are held together rather than dispatched apart,
 * because a type this factory can make is exactly a type it has to be able to
 * remove, and two switches would be two places to keep in step.
 */
interface SimCfnSesResourceHandler {
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options: SimCfnResourceCallerOptions,
  ): Promise<object>;
  delete(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void>;
}

/**
 * CloudFormation Resource factory for simulated SES resources.
 *
 * Email identities, templates and configuration sets are the AWS::SES::*
 * Resource types this simulation models. Contact lists and receipt rules need
 * machinery it does not have, so a template declaring one is reported as
 * unsupported rather than quietly treated as deployed.
 */
export class SimSesCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #handlers: ReadonlyMap<string, SimCfnSesResourceHandler>;

  constructor(properties: SimSesCfnResourceFactoryProperties) {
    const { ses } = properties;

    this.#handlers = new Map([
      [
        sesEmailIdentityResourceTypeName,
        handler(new SimCfnSesIdentityCreator({ ses }), "identity"),
      ],
      [
        sesTemplateResourceTypeName,
        handler(new SimCfnSesTemplateCreator({ ses }), "template"),
      ],
      [
        sesConfigurationSetResourceTypeName,
        handler(
          new SimCfnSesConfigurationSetCreator({ ses }),
          "configuration set",
        ),
      ],
    ]);
  }

  /**
   * Create a simulated SES resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    return await this.handler(resourceTypeName, "").create(
      resource,
      context.resolvedProperties ?? resource.properties,
      simCfnResourceCallerOptions(context.caller),
    );
  }

  /**
   * Delete a simulated SES resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.handler(resourceTypeName, " deletion").delete(
      resource,
      simCfnResourceCallerOptions(context.caller),
    );
  }

  private handler(
    resourceTypeName: string,
    operationSuffix: string,
  ): SimCfnSesResourceHandler {
    const handler = this.#handlers.get(resourceTypeName);

    assertDefined(
      handler,
      `Unsupported sim SES CloudFormation Resource ` +
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
      options: SimCfnResourceCallerOptions,
    ): Promise<T>;
    delete(created: T, options: SimCfnResourceCallerOptions): Promise<void>;
  },
  described: string,
): SimCfnSesResourceHandler {
  return {
    create: async (resource, properties, options): Promise<T> =>
      await creator.create(resource, properties, options),
    delete: async (resource, options): Promise<void> => {
      await creator.delete(created<T>(resource, described), options);
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
    `sim SES ${described} for CloudFormation Resource ${resource.logicalId}`,
  );

  return simResource;
}
