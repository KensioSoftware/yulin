import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimEcrRepository } from "../repository/sim-ecr-repository.js";
import type { SimEcr } from "../sim-ecr.js";
import { SimCfnEcrRepositoryCreator } from "./repository/sim-cfn-ecr-repository-creator.js";

interface SimEcrCfnResourceFactoryProperties {
  readonly ecr: SimEcr;
}

/**
 * CloudFormation Resource factory for simulated ECR resources.
 *
 * AWS::ECR::Repository is the only Resource type ECR has that means anything
 * here. There is no resource type for an image, on real AWS or in this
 * simulation, because an image is pushed rather than declared.
 */
export class SimEcrCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly repositoryCreator: SimCfnEcrRepositoryCreator;

  constructor(properties: SimEcrCfnResourceFactoryProperties) {
    this.repositoryCreator = new SimCfnEcrRepositoryCreator({
      ecr: properties.ecr,
    });
  }

  /**
   * Create a simulated ECR resource from a CloudFormation Resource.
   */
  create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    if (resourceTypeName !== "Repository") {
      throw new Error(
        `Unsupported sim ECR CloudFormation Resource ${resourceTypeName}`,
      );
    }

    return Promise.resolve(
      this.repositoryCreator.create(
        resource,
        context.resolvedProperties ?? resource.properties,
      ),
    );
  }

  /**
   * Delete a simulated ECR resource created from a CloudFormation Resource.
   */
  delete(resourceTypeName: string, resource: SimCfnResource): Promise<void> {
    if (resourceTypeName !== "Repository") {
      throw new Error(
        `Unsupported sim ECR CloudFormation Resource ${resourceTypeName} ` +
          `deletion`,
      );
    }

    const repository = resource.simResource as SimEcrRepository | undefined;
    assertDefined(
      repository,
      `sim ECR repository for CloudFormation Resource ${resource.logicalId}`,
    );

    this.repositoryCreator.delete(resource, repository);

    return Promise.resolve();
  }
}
