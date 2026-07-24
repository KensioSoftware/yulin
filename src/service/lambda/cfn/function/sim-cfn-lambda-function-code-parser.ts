import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaFunctionCode } from "../../command/create-function/create-function.cmd.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";
import { SimCfnLambdaPropertyParser } from "./sim-cfn-lambda-property-parser.js";

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
  ): SimLambdaFunctionCode | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.propertyParser.invalidPropertyError(
        resource,
        "Code",
        "an object",
      );
    }

    return {
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
