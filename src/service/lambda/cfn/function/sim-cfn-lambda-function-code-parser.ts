import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaFunctionCode } from "../../command/create-function/create-function.command.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";
import { SimCfnLambdaPropertyParser } from "./sim-cfn-lambda-property-parser.js";

/**
 * The parsed AWS::Lambda::Function Code property.
 *
 * The image URI is kept apart from the CreateFunction code input because sim
 * Lambda has nothing to do with it: a container image function is either
 * backed by an executable binding, which replaces its code wholesale, or
 * skipped. Carrying it here is what lets the skip name the image.
 */
export interface SimCfnLambdaParsedCode {
  readonly code: SimLambdaFunctionCode | undefined;
  readonly imageUri: string | undefined;
}

/**
 * Parses the AWS::Lambda::Function Code property into sim Lambda
 * CreateFunction code input.
 *
 * Template values are JSON, so an inline Code.ZipFile is a source string,
 * which real CloudFormation packages as a single-module zip. The existing
 * makeLambdaCodeZip models exactly that. S3-located code passes through
 * as-is for the CreateFunction handler to fetch from sim S3.
 */
export class SimCfnLambdaFunctionCodeParser {
  private readonly propertyParser = new SimCfnLambdaPropertyParser();

  /**
   * Parse the Code property for an AWS::Lambda::Function.
   */
  parse(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
  ): SimCfnLambdaParsedCode {
    if (value === undefined) {
      return { code: undefined, imageUri: undefined };
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.propertyParser.invalidPropertyError(
        resource,
        "Code",
        "an object",
      );
    }

    return {
      code: {
        ZipFile: this.zipFileBytes(resource, value["ZipFile"]),
        S3Bucket: this.propertyParser.optionalString(
          resource,
          value["S3Bucket"],
          "Code.S3Bucket",
        ),
        S3Key: this.propertyParser.optionalString(
          resource,
          value["S3Key"],
          "Code.S3Key",
        ),
        S3ObjectVersion: this.propertyParser.optionalString(
          resource,
          value["S3ObjectVersion"],
          "Code.S3ObjectVersion",
        ),
      },
      imageUri: this.propertyParser.optionalString(
        resource,
        value["ImageUri"],
        "Code.ImageUri",
      ),
    };
  }

  private zipFileBytes(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
  ): Uint8Array | undefined {
    const zipFileSource = this.propertyParser.optionalString(
      resource,
      value,
      "Code.ZipFile",
    );
    if (zipFileSource === undefined) {
      return undefined;
    }

    return makeLambdaCodeZip(zipFileSource);
  }
}
