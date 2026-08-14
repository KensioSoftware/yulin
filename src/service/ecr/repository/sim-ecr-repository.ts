import type { SimArn } from "../../aws/arn.js";
import {
  SimEcrImage,
  type SimEcrImageHandler,
} from "../image/sim-ecr-image.js";
import type { SimEcrRepositoryAddress } from "./sim-ecr-repository-address.js";

/**
 * What registering a handler as the image in a repository says.
 *
 * The tag defaults to `latest`, as a push with no tag does. The handler is
 * what a function created from this image runs.
 */
export interface SimEcrSimulatedImageInput<TEvent = never, TResult = unknown> {
  readonly imageTag?: string;
  readonly handler: SimEcrImageHandler<TEvent, TResult>;
}

interface SimEcrRepositoryProperties {
  readonly repositoryName: string;
  readonly address: SimEcrRepositoryAddress;
}

/**
 * A simulated ECR repository: a name that holds images by tag.
 *
 * The repository is the point of all this. It is the stable name for the thing
 * that holds a piece of code, and it outlives any stack, any tag and any CDK
 * construct ID, so one registration in test setup backs every function in
 * every stack that runs an image from it.
 */
export class SimEcrRepository {
  public readonly repositoryName: string;

  private readonly address: SimEcrRepositoryAddress;
  private readonly imagesByTag = new Map<string, SimEcrImage>();

  constructor(properties: SimEcrRepositoryProperties) {
    this.repositoryName = properties.repositoryName;
    this.address = properties.address;
  }

  /**
   * The repository URI, which a Lambda `Code.ImageUri` names with a tag on the
   * end of it.
   */
  get repositoryUri(): string {
    return this.address.uri(this.repositoryName);
  }

  /**
   * The repository ARN.
   */
  get repositoryArn(): SimArn {
    return this.address.arn(this.repositoryName);
  }

  /**
   * Whether this repository holds any simulated image.
   */
  get hasImage(): boolean {
    return this.imagesByTag.size > 0;
  }

  /**
   * Register a real in-process handler as the image this repository holds
   * under a tag.
   *
   * This is a Yulin-native operation rather than a simulated `PutImage`, which
   * is deliberate: real `PutImage` takes an image manifest for layers that
   * were pushed over the Docker registry protocol, and none of that exists
   * here. Registering the same tag again replaces what it held.
   */
  simulateImage<TEvent = never, TResult = unknown>(
    input: SimEcrSimulatedImageInput<TEvent, TResult>,
  ): this {
    const imageTag = input.imageTag ?? "latest";

    this.imagesByTag.set(
      imageTag,
      new SimEcrImage({ imageTag, handler: input.handler }),
    );

    return this;
  }

  /**
   * The image a reference to this repository resolves to.
   *
   * A tag this repository holds is answered with exactly that image. Any other
   * tag, and a reference carrying no tag at all, is answered with the image
   * registered most recently, because the tag a template names is rarely one a
   * test could have written down: a CDK image asset is tagged with a content
   * hash and a pipeline-built image with a build number.
   *
   * Undefined means this repository holds no simulated image, which callers
   * report in their own terms.
   */
  image(imageTag?: string): SimEcrImage | undefined {
    const tagged =
      imageTag === undefined ? undefined : this.imagesByTag.get(imageTag);

    return tagged ?? this.latestRegisteredImage();
  }

  /**
   * Every image this repository holds, in the order they were registered.
   */
  images(): readonly SimEcrImage[] {
    return this.imagesByTag.values().toArray();
  }

  /**
   * The image registered most recently, or undefined where there is none.
   */
  private latestRegisteredImage(): SimEcrImage | undefined {
    return this.images().at(-1);
  }
}
