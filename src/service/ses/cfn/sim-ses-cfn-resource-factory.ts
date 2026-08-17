import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimSesIdentity } from "../identity/sim-ses-identity.js";
import type { SimSesV2 } from "../sim-ses-v2.js";
import type { SimSesTemplate } from "../template/sim-ses-template.js";
import { SimCfnSesIdentityCreator } from "./identity/sim-cfn-ses-identity-creator.js";
import {
  sesEmailIdentityResourceTypeName,
  sesTemplateResourceTypeName,
} from "./sim-cfn-ses-resource-types.js";
import { SimCfnSesTemplateCreator } from "./template/sim-cfn-ses-template-creator.js";

interface SimSesCfnResourceFactoryProperties {
  readonly ses: SimSesV2;
}

/**
 * CloudFormation Resource factory for simulated SES resources.
 *
 * Email identities and templates are the two AWS::SES::* Resource types this
 * simulation models. Configuration sets, contact lists and receipt rules need
 * machinery it does not have, so a template declaring one is reported as
 * unsupported rather than quietly treated as deployed.
 */
export class SimSesCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #identityCreator: SimCfnSesIdentityCreator;
  readonly #templateCreator: SimCfnSesTemplateCreator;

  constructor(properties: SimSesCfnResourceFactoryProperties) {
    this.#identityCreator = new SimCfnSesIdentityCreator({
      ses: properties.ses,
    });
    this.#templateCreator = new SimCfnSesTemplateCreator({
      ses: properties.ses,
    });
  }

  /**
   * Create a simulated SES resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case sesEmailIdentityResourceTypeName: {
        return await this.#identityCreator.create(resource, properties);
      }
      case sesTemplateResourceTypeName: {
        return await this.#templateCreator.create(resource, properties);
      }
      default: {
        throw unsupportedResourceType(resourceTypeName, "");
      }
    }
  }

  /**
   * Delete a simulated SES resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case sesEmailIdentityResourceTypeName: {
        await this.#identityCreator.delete(
          created<SimSesIdentity>(resource, "identity"),
        );
        return;
      }
      case sesTemplateResourceTypeName: {
        await this.#templateCreator.delete(
          created<SimSesTemplate>(resource, "template"),
        );
        return;
      }
      default: {
        throw unsupportedResourceType(resourceTypeName, " deletion");
      }
    }
  }
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

function unsupportedResourceType(
  resourceTypeName: string,
  operationSuffix: string,
): Error {
  return new Error(
    `Unsupported sim SES CloudFormation Resource ` +
      `${resourceTypeName}${operationSuffix}`,
  );
}
