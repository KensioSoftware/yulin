import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimEcrRepository } from "../../repository/sim-ecr-repository.js";
import type { SimEcr } from "../../sim-ecr.js";
import { SimCfnEcrRepositoryProperties } from "./sim-cfn-ecr-repository-properties.js";

interface SimCfnEcrRepositoryCreatorProperties {
  readonly ecr: SimEcr;
}

/**
 * Creates simulated repositories from AWS::ECR::Repository Resources.
 *
 * A template declares a repository and never an image, which is what real
 * CloudFormation does too: an image is pushed by whatever built it, long
 * before any stack that runs it is deployed. So a deployed repository starts
 * empty unless a test has already registered a handler as its image, and it
 * keeps that handler if it has, since the repository outlives the stack.
 */
export class SimCfnEcrRepositoryCreator {
  private readonly ecr: SimEcr;

  constructor(properties: SimCfnEcrRepositoryCreatorProperties) {
    this.ecr = properties.ecr;
  }

  /**
   * Create a repository from an AWS::ECR::Repository Resource.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimEcrRepository {
    const repositoryProperties = new SimCfnEcrRepositoryProperties({
      resource,
      properties,
    });
    const repositoryName = repositoryProperties.repositoryName();

    repositoryProperties.recordIgnoredProperties();

    return this.ecr.repository(repositoryName);
  }

  /**
   * Delete a repository created from an AWS::ECR::Repository Resource.
   *
   * The simulated images go with it. They are handlers a test registered
   * rather than artifacts a pipeline pushed, so there is nothing here for the
   * refusal real ECR makes over a repository that still holds images to
   * protect, and a teardown that could not remove a repository would leave a
   * later deploy of the same template adopting the old one.
   */
  delete(repository: SimEcrRepository): void {
    this.ecr.deleteRepository(repository.repositoryName);
  }
}
