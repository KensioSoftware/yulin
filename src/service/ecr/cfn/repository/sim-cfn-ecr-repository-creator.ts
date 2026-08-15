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
   * A repository holding a simulated image is left where it is, and the
   * deletion is recorded as skipped. The image is a handler registered outside
   * any stack, usually in test setup, and it is the whole reason the
   * repository is the place to say what an image is: it outlives the stack
   * that declared it. Taking it down with one stack would leave the next
   * deploy resolving nothing.
   *
   * Real ECR refuses to delete a repository that still holds images too,
   * which fails the stack unless the template says `EmptyOnDelete`. This
   * records the refusal rather than failing the teardown, because what is
   * being protected here is a test's own registration rather than anything
   * CloudFormation put there.
   */
  delete(resource: SimCfnResource, repository: SimEcrRepository): void {
    if (repository.hasImage) {
      throw new Error(
        `Unsupported sim ECR CloudFormation Resource ${resource.logicalId} ` +
          `deletion: the simulated ECR repository ` +
          `${repository.repositoryName} holds a simulated image, which ` +
          `outlives the Stack that declared the repository`,
      );
    }

    this.ecr.deleteRepository(repository.repositoryName);
  }
}
