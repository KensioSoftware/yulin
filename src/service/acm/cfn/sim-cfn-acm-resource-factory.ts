import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimAcm } from "../sim-acm.js";
import { SimCfnAcmCertificateCreator } from "./certificate/sim-cfn-acm-cert-creator.js";

interface SimAcmCfnResourceFactoryProperties {
  readonly acm?: SimAcm | undefined;
}

/**
 * CloudFormation Resource factory for simulated ACM resources.
 */
export class SimAcmCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly certificateCreator: SimCfnAcmCertificateCreator;

  constructor(properties: SimAcmCfnResourceFactoryProperties = {}) {
    const { acm = new SimAcm() } = properties;

    this.certificateCreator = new SimCfnAcmCertificateCreator({ acm });
  }

  /**
   * Create a simulated ACM resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Certificate": {
        return await this.certificateCreator.create(resource, context);
      }
      default: {
        throw new Error(
          `Unsupported sim ACM CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
