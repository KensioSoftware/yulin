import type { SimLambdaHandler } from "../../sim-lambda-handler.type.js";

/**
 * What a container image URI resolved to.
 *
 * Yulin never reads an image, so an image URI is only ever an identifier. The
 * most it can resolve to is a real in-process handler something registered as
 * that image, and where nothing has, the reason is what a caller reports:
 * CloudFormation puts it in a skip, and CreateFunction in a refusal.
 */
export class SimLambdaContainerImage {
  public readonly handler: SimLambdaHandler | undefined;

  private readonly reason: string;

  private constructor(handler: SimLambdaHandler | undefined, reason: string) {
    this.handler = handler;
    this.reason = reason;
  }

  /**
   * An image a real in-process handler stands in for.
   */
  static simulatedBy(handler: SimLambdaHandler): SimLambdaContainerImage {
    return new SimLambdaContainerImage(handler, "");
  }

  /**
   * An image nothing in this simulation stands in for, and why not.
   */
  static unsimulated(reason: string): SimLambdaContainerImage {
    return new SimLambdaContainerImage(undefined, reason);
  }

  /**
   * Why nothing here can run this image.
   *
   * Empty for an image a handler stands in for, which callers only reach when
   * there is no handler.
   */
  unsimulatedReason(): string {
    return this.reason;
  }
}

/**
 * Where a container image URI is resolved to something this simulation can
 * run.
 */
export interface SimLambdaContainerImages {
  /**
   * The image this URI names, as far as this simulation can run it.
   */
  image(imageUri: string): SimLambdaContainerImage;
}

/**
 * The container images of a simulated Lambda that has none to look in.
 *
 * A standalone SimLambda is its own little universe, with no simulated ECR
 * beside it, so every image URI is one nothing stands in for.
 */
export class SimLambdaNoContainerImages implements SimLambdaContainerImages {
  /**
   * Never any image, whatever the URI names.
   */
  image(imageUri: string): SimLambdaContainerImage {
    return SimLambdaContainerImage.unsimulated(
      `nothing simulates the container image ${imageUri}, as this simulated ` +
        `Lambda has no simulated ECR beside it`,
    );
  }
}
