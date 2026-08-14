import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnLambdaFunctionProperties } from "./sim-cfn-lambda-function-properties-parser.js";

/**
 * The PackageType real Lambda uses for a container image function.
 */
const imagePackageType = "Image";

/**
 * Skips template functions packaged as a container image.
 *
 * Yulin never looks inside an image. It cannot: an image may hold a Go binary
 * or a Python application, and sim Lambda evaluates handler modules as
 * CommonJS in a vm. So the image URI is only ever an identifier, and a
 * function packaged as an image has no code Yulin can run.
 *
 * A function with an executable binding is exempt, because the binding
 * replaces the code with a real in-process handler. That is how to simulate a
 * container image function, and the skip message says so.
 *
 * This is separate from the runtime skip because a container image function
 * declares no Runtime at all, so there is nothing there for that gate to
 * decline.
 *
 * The "Unsupported sim ... CloudFormation" wording marks the Resource as
 * skipped rather than failing the stack.
 */
export class SimCfnLambdaImageSkip {
  /**
   * A skip error when this function is packaged as a container image,
   * otherwise undefined.
   */
  findSkipError(
    resource: SimCfnResource,
    functionProperties: SimCfnLambdaFunctionProperties,
    bound: boolean,
  ): Error | undefined {
    if (bound || !this.isImagePackaged(functionProperties)) {
      return undefined;
    }

    return new Error(
      `Unsupported sim Lambda CloudFormation Resource ${resource.logicalId}: ` +
        `${this.imageDescription(functionProperties)}. Bind a real ` +
        `in-process handler to this function to simulate it.`,
    );
  }

  /**
   * Whether this function is packaged as a container image.
   *
   * CDK always synthesizes PackageType alongside Code.ImageUri, but a
   * hand-written template need not, so either one on its own is enough.
   */
  private isImagePackaged(
    functionProperties: SimCfnLambdaFunctionProperties,
  ): boolean {
    return (
      functionProperties.packageType === imagePackageType ||
      functionProperties.imageUri !== undefined
    );
  }

  /**
   * What the skip reason says could not be run, naming the image where the
   * template gave one.
   */
  private imageDescription(
    functionProperties: SimCfnLambdaFunctionProperties,
  ): string {
    const { imageUri } = functionProperties;

    if (imageUri === undefined) {
      return "sim Lambda cannot run container images";
    }

    return `sim Lambda cannot run the container image ${imageUri}`;
  }
}
