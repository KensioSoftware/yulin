import { SimEcrImageReference } from "../../../../ecr/image/sim-ecr-image-reference.js";
import type { SimEcrRegistry } from "../../../../ecr/registry/sim-ecr-registry.js";
import {
  SimLambdaContainerImage,
  type SimLambdaContainerImages,
} from "./sim-lambda-container-images.js";

interface SimEcrLambdaContainerImagesProperties {
  readonly repositories: SimEcrRegistry;
}

/**
 * The simulated ECR a container image function's image URI is resolved in.
 *
 * The whole simulation's repositories are read rather than one scope's,
 * because an image URI names the account and region it comes from: a function
 * in one account can run an image from another account's registry, as it can
 * on real AWS.
 *
 * The two ways of finding nothing are reported apart, because they send a
 * reader to different places. No repository means nothing registered a handler
 * under that name, or registered it in another account. A repository with no
 * image means the name was right and the handler is missing.
 */
export class SimEcrLambdaContainerImages implements SimLambdaContainerImages {
  private readonly repositories: SimEcrRegistry;

  constructor(properties: SimEcrLambdaContainerImagesProperties) {
    this.repositories = properties.repositories;
  }

  /**
   * The image a URI names, as simulated ECR holds it.
   */
  image(imageUri: string): SimLambdaContainerImage {
    const repository = this.repositories.repositoryFor(imageUri);

    if (repository === undefined) {
      return SimLambdaContainerImage.unsimulated(
        `no simulated ECR repository holds the container image ${imageUri}`,
      );
    }

    const image = repository.image(
      new SimEcrImageReference(imageUri).imageTag(),
    );

    if (image === undefined) {
      return SimLambdaContainerImage.unsimulated(
        `the simulated ECR repository ${repository.repositoryUri} holds no ` +
          `image`,
      );
    }

    return SimLambdaContainerImage.simulatedBy(image.handler);
  }
}
