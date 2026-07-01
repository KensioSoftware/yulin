import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimAcm } from "../sim-acm.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAcmCertificate } from "../certificate/sim-acm-certificate.js";
import { SimCfnAcmCertificateProperties } from "./property/sim-cfn-acm-cert-properties.js";

interface SimAcmCfnResourceFactoryProps {
  readonly acm?: SimAcm | undefined;
}

/**
 * CloudFormation Resource factory for simulated ACM resources.
 */
export class SimAcmCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly acm: SimAcm;

  constructor(props: SimAcmCfnResourceFactoryProps = {}) {
    const { acm = new SimAcm() } = props;

    this.acm = acm;
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
        return await this.createCertificate(resource, context);
      }
      default: {
        throw new Error(
          `Unsupported sim ACM CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  private async createCertificate(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<SimAcmCertificate> {
    const properties = new SimCfnAcmCertificateProperties({
      logicalId: resource.logicalId,
      properties: context.resolvedProperties ?? resource.properties,
    });

    const requestCertificateOutput = await this.acm.requestCertificate({
      input: {
        DomainName: properties.domainName(),
        SubjectAlternativeNames: properties.subjectAlternativeNames(),
        ValidationMethod: properties.validationMethod(),
        DomainValidationOptions: properties.domainValidationOptions(),
        Tags: properties.tags(),
      },
    });

    const certificateArn = requestCertificateOutput.CertificateArn;
    assertDefined(
      certificateArn,
      `sim ACM Certificate ARN after CloudFormation creation for ${resource.logicalId}`,
    );

    const certificate = this.acm.certificates.get(certificateArn);
    assertDefined(
      certificate,
      `sim ACM Certificate ${certificateArn} after CloudFormation creation`,
    );

    return certificate;
  }
}
