import type { SimLambdaHandler } from "../../lambda/function/sim-lambda-handler.type.js";

/**
 * What a simulated container image actually is: a real in-process handler.
 *
 * Yulin never reads image content, so there is nothing else an image could be
 * here. A handler function is the only thing this simulator can run, which is
 * why this is the sim Lambda handler type rather than a shape of its own.
 */
export type SimEcrImageHandler<
  TEvent = never,
  TResult = unknown,
> = SimLambdaHandler<TEvent, TResult>;

interface SimEcrImageProperties {
  readonly imageTag: string;
  readonly handler: SimEcrImageHandler;
}

/**
 * One image in a simulated ECR repository.
 *
 * An image is a tag and the handler simulating what that image runs. It holds
 * no layers, no manifest and no digest, because nothing here would read them:
 * a function created from this image is created from the handler.
 */
export class SimEcrImage {
  public readonly imageTag: string;
  public readonly handler: SimEcrImageHandler;

  constructor(properties: SimEcrImageProperties) {
    this.imageTag = properties.imageTag;
    this.handler = properties.handler;
  }
}
