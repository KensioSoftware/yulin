import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnLambdaCodeInput } from "./sim-cfn-lambda-code-input.js";
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
 * A function a real in-process handler backs is exempt, whether that handler
 * came from an executable binding or from the simulated ECR repository the
 * image URI names. Those are the two ways to simulate a container image
 * function, and the skip message says so.
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
    code: SimCfnLambdaCodeInput,
  ): Error | undefined {
    if (code.bound || !this.isImagePackaged(functionProperties)) {
      return undefined;
    }

    return new Error(
      `Unsupported sim Lambda CloudFormation Resource ${resource.logicalId}: ` +
        `${this.imageDescription(functionProperties)}${this.unsimulatedImage(code)}` +
        `. Bind a real in-process handler to this function, or register one ` +
        `as the image in a simulated ECR repository, to simulate it.`,
    );
  }

  /**
   * What simulated ECR had to say about the image, where the function names
   * one.
   *
   * This is the difference between a repository nothing made and a repository
   * holding no image, which is the difference between a name that is wrong and
   * a handler that was never registered.
   */
  private unsimulatedImage(code: SimCfnLambdaCodeInput): string {
    if (code.unsimulatedImageReason === undefined) {
      return "";
    }

    return `, and ${code.unsimulatedImageReason}`;
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
