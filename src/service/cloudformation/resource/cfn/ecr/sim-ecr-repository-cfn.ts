import type { SimEcrRepository } from "../../../../ecr/repository/sim-ecr-repository.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimEcrRepositoryCfnProperties {
  readonly repository: SimEcrRepository;
}

/**
 * CloudFormation-facing values for a simulated ECR repository.
 */
export class SimEcrRepositoryCfn implements SimCfnResourceValueAdapter {
  private readonly repository: SimEcrRepository;

  constructor(properties: SimEcrRepositoryCfnProperties) {
    this.repository = properties.repository;
  }

  /**
   * AWS::ECR::Repository Ref returns the repository name.
   */
  refValue(): SimCfnTemplateValue {
    return this.repository.repositoryName;
  }

  /**
   * AWS::ECR::Repository attributes.
   *
   * The ARN is what an IAM policy names the repository by, and the URI is what
   * a function's `Code.ImageUri` is built from, which is how a template says
   * which repository a function's image comes from.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.repository.repositoryArn;
      }
      case "RepositoryUri": {
        return this.repository.repositoryUri;
      }
      default: {
        throw new Error(
          `Unsupported AWS::ECR::Repository attribute ${attributeName}`,
        );
      }
    }
  }
}
