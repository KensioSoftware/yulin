import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimLambdaEnvironment } from "../environment/sim-lambda-environment.js";
import {
  type SimLambdaContainerImages,
  SimLambdaNoContainerImages,
} from "./image/sim-lambda-container-images.js";
import type { SimLambdaCodeSource } from "./lambda-code-source.js";
import {
  type SimLambdaExecutableCode,
  SimLambdaHandlerReferenceCode,
} from "./sim-lambda-executable-code.js";
import { SimLambdaVmZipCodeFactory } from "./sim-lambda-vm-zip-code-factory.js";
import {
  type SimLambdaCodeStore,
  SimLambdaNoCodeStore,
} from "./store/sim-lambda-code-store.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import type { SimLambdaVmSdkModuleProvider } from "./vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimLambdaOutboundHttp } from "../outbound/sim-lambda-outbound-http.js";

interface SimLambdaCodeResolverProperties {
  readonly codeStore?: SimLambdaCodeStore | undefined;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
  /**
   * Where the HTTP requests vm zip code makes to hostnames the simulation
   * serves are answered. A handler reference needs none: it runs in the host
   * scope, where the invocation bridges the HTTP clients.
   */
  readonly outboundHttp?: SimLambdaOutboundHttp | undefined;
  /**
   * Where a container image URI is resolved to a real in-process handler.
   */
  readonly containerImages?: SimLambdaContainerImages | undefined;
  /**
   * Clock vm zip code reports as the current time. A handler reference needs
   * none: it runs in the host scope, where the invocation bridges the clock.
   */
  readonly clock?: SimClock | undefined;
}

/**
 * The function details a code source is resolved for: the handler identifier
 * selecting the module and export, the execution environment for vm code, and
 * the creating caller for S3 code fetch authorization.
 */
export interface SimLambdaCodeResolveContext {
  readonly handlerName: string | undefined;
  readonly environment: SimLambdaEnvironment;
  readonly caller?: SimAwsCaller | undefined;
  /**
   * What to say when zip code arrives with no handler name to find its export
   * in. CreateFunction takes the name on the request, while UpdateFunctionCode
   * has only whatever the function was created with.
   */
  readonly missingHandlerMessage?: string | undefined;
}

/**
 * Resolves a validated CreateFunction code source into executable sim Lambda
 * code.
 *
 * As on real AWS, S3-located code is fetched and zip validity is checked at
 * function creation, while module import and handler lookup problems only
 * surface later, at invocation cold start.
 */
export class SimLambdaCodeResolver {
  private readonly codeStore: SimLambdaCodeStore;
  private readonly containerImages: SimLambdaContainerImages;
  private readonly vmZipCodeFactory: SimLambdaVmZipCodeFactory;

  constructor(properties: SimLambdaCodeResolverProperties) {
    this.codeStore = properties.codeStore ?? new SimLambdaNoCodeStore();
    this.containerImages =
      properties.containerImages ?? new SimLambdaNoContainerImages();
    this.vmZipCodeFactory = new SimLambdaVmZipCodeFactory({
      vmSdkModuleProvider: properties.vmSdkModuleProvider,
      outboundHttp: properties.outboundHttp,
      clock: properties.clock,
    });
  }

  /**
   * Resolve the code source into executable code.
   */
  async resolve(
    source: SimLambdaCodeSource,
    context: SimLambdaCodeResolveContext,
  ): Promise<SimLambdaExecutableCode> {
    switch (source.kind) {
      case "handler-reference": {
        return new SimLambdaHandlerReferenceCode(source.handlerFunction);
      }
      case "zip-bytes": {
        return this.vmZipCodeFactory.make(source.zipBytes, context);
      }
      case "s3-location": {
        const zipBytes = await this.codeStore.getZipBytes({
          bucketName: source.bucketName,
          objectKey: source.objectKey,
          caller: context.caller,
        });
        return this.vmZipCodeFactory.make(zipBytes, context);
      }
      case "container-image": {
        return new SimLambdaHandlerReferenceCode(
          this.containerImageHandler(source.imageUri),
        );
      }
    }
  }

  /**
   * The handler standing in for a container image, refusing the function where
   * nothing stands in for it.
   *
   * Real Lambda refuses a function whose image it cannot pull, so refusing
   * here is the closest thing to that: an image URI is an identifier, and one
   * naming nothing this simulation holds is a function with no code.
   */
  private containerImageHandler(imageUri: string): SimLambdaHandler {
    const image = this.containerImages.image(imageUri);

    if (image.handler === undefined) {
      throw new SimLambdaInvalidParameterValueException(
        `Source image ${imageUri} cannot be run: ` +
          `${image.unsimulatedReason()}. Register a real in-process handler ` +
          `as the image in a simulated ECR repository to simulate it.`,
      );
    }

    return image.handler;
  }
}
