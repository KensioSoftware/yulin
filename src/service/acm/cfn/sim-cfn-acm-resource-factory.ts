import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimAcm } from "../sim-acm.js";
import { SimCfnAcmCertificateCreator } from "./certificate/sim-cfn-acm-cert-creator.js";
import type { SimAcmCertificate } from "../certificate/sim-acm-certificate.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimAcmCfnResourceFactoryProperties {
  readonly acm?: SimAcm | undefined;
}

/**
 * CloudFormation Resource factory for simulated ACM resources.
 */
export class SimAcmCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly acm: SimAcm;
  private readonly certificateCreator: SimCfnAcmCertificateCreator;

  constructor(properties: SimAcmCfnResourceFactoryProperties = {}) {
    const { acm = new SimAcm() } = properties;

    this.acm = acm;
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

  /**
   * Delete a simulated ACM resource created from a CloudFormation Resource.
   *
   * DeleteCertificate refuses a certificate that is still in use, so a
   * certificate a CloudFront Distribution still names comes down after that
   * Distribution, which the teardown order arranges.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    if (resourceTypeName !== "Certificate") {
      throw new Error(
        `Unsupported sim ACM CloudFormation Resource ${resourceTypeName} deletion`,
      );
    }

    const certificate = resource.simResource as SimAcmCertificate | undefined;
    assertDefined(
      certificate,
      `sim ACM certificate for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.acm.deleteCertificate({
      input: { CertificateArn: certificate.certificateArn },
    });
  }
}
