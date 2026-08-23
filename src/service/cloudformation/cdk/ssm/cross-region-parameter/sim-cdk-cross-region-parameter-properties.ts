import { AWS_REGION_NAMES } from "../../../../aws/sim-aws-region.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import { jsonStringify } from "../../../../../util/type-guard/json.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { crossRegionParameterError } from "./sim-cdk-cross-region-parameter-error.js";

/**
 * The properties CDK puts on a Custom::CrossRegionStringParameterReader
 * Resource.
 *
 * `ServiceToken` is read and ignored. It points at CDK's own provider
 * function, whose whole job is the GetParameter call this factory makes
 * instead. `RefreshToken` is the logical ID of the function version the
 * parameter was written from, and CDK puts it there so that publishing a new
 * version makes CloudFormation run the reader again. The reader here runs on
 * every deployment either way, so the token has nothing left to say.
 */
const knownPropertyNames: ReadonlySet<string> = new Set([
  "ParameterName",
  "Region",
  "RefreshToken",
  "ServiceToken",
]);

/**
 * Reads the properties of one Custom::CrossRegionStringParameterReader
 * Resource.
 *
 * A property name CDK does not emit is refused rather than ignored, as it is
 * for Bucket notifications. This Resource is a private contract between CDK
 * and its own provider function, so a name that turns up here is a version of
 * CDK asking for something this simulation has not been told about.
 */
export class SimCdkCrossRegionParameterProperties {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(logicalId: string, properties: SimCfnTemplateValueRecord) {
    this.logicalId = logicalId;
    this.properties = properties;

    this.refuseUnknownProperties();
  }

  /**
   * The name of the parameter to read.
   */
  get parameterName(): string {
    const parameterName = this.properties["ParameterName"];

    if (typeof parameterName !== "string" || parameterName === "") {
      throw crossRegionParameterError(
        this.logicalId,
        "ParameterName must resolve to a parameter name",
      );
    }

    return parameterName;
  }

  /**
   * The Region the parameter is read from.
   *
   * CDK writes `us-east-1` here for an EdgeFunction, since that is the only
   * Region CloudFront runs a Lambda@Edge function from, but the Resource type
   * says nothing about Lambda@Edge and the Region is read as written.
   */
  get regionName(): AwsRegionName {
    const regionName = this.properties["Region"];

    if (
      typeof regionName !== "string" ||
      !(AWS_REGION_NAMES as readonly string[]).includes(regionName)
    ) {
      throw crossRegionParameterError(
        this.logicalId,
        `Region must resolve to a known AWS Region, and ` +
          `${jsonStringify(regionName)} is not one`,
      );
    }

    return regionName as AwsRegionName;
  }

  private refuseUnknownProperties(): void {
    for (const name of Object.keys(this.properties)) {
      if (!knownPropertyNames.has(name)) {
        throw crossRegionParameterError(
          this.logicalId,
          `${name} is not a Custom::CrossRegionStringParameterReader ` +
            "property this simulation knows about, so it is refused rather " +
            "than ignored",
        );
      }
    }
  }
}
