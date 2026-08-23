import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import { SimSsmParameterNotFound } from "../../../../ssm/error/sim-ssm.error.js";
import type { SimCfnServiceResourceFactory } from "../../../resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../resource/sim-cfn-resource.js";
import {
  crossRegionParameterError,
  crossRegionParameterResourceTypeName,
} from "./sim-cdk-cross-region-parameter-error.js";
import { SimCdkCrossRegionParameterProperties } from "./sim-cdk-cross-region-parameter-properties.js";
import { SimCdkCrossRegionParameterReading } from "./sim-cdk-cross-region-parameter-reading.js";

/**
 * CloudFormation Resource factory for CDK's cross-Region parameter reader.
 *
 * `cloudfront.experimental.EdgeFunction` in a Stack outside `us-east-1` puts
 * the function itself in a support Stack there and writes its version ARN to
 * an SSM parameter. The using Stack reads that parameter back through a
 * `Custom::CrossRegionStringParameterReader` Resource, and the Behavior's
 * `LambdaFunctionARN` is an `Fn::GetAtt` on it. Without the read the ARN never
 * arrives, and CloudFront refuses the Distribution over a value that is not an
 * ARN at all.
 *
 * The Resource carries the parameter name and the Region, so this factory
 * makes the GetParameter call CDK's provider function would have made, through
 * the ordinary command path. Deploy the whole cloud assembly and the support
 * Stack has written the parameter by the time this runs, because the manifest
 * says the using Stack comes after it.
 *
 * Deploy the using Stack's template on its own and the parameter is not there.
 * The reader is created holding nothing rather than failing, so the Stack
 * deploys and the Distribution goes up without the association, which is
 * recorded on it. A site survives an edge function whose Stack was left out
 * the way it survives one this simulation cannot run.
 */
export class SimCdkCrossRegionParameterReaderResourceFactory implements SimCfnServiceResourceFactory {
  /**
   * Read the parameter the Resource names, in the Region it names.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<SimCdkCrossRegionParameterReading> {
    /* v8 ignore if -- defensive catch; the resolver routes on this name */
    if (resourceTypeName !== crossRegionParameterResourceTypeName) {
      throw crossRegionParameterError(
        resource.logicalId,
        `${resourceTypeName} is not a Resource type this factory creates`,
      );
    }

    const properties = new SimCdkCrossRegionParameterProperties(
      resource.logicalId,
      context.resolvedProperties ?? resource.properties,
    );
    const { parameterName, regionName } = properties;

    return new SimCdkCrossRegionParameterReading({
      parameterName,
      regionName,
      value: await this.read(resource, context, parameterName, regionName),
    });
  }

  /**
   * Forget the reading.
   *
   * CDK's provider function does nothing on its Delete event either. The
   * parameter belongs to the Stack that wrote it, and reading a value leaves
   * nothing behind to take away.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    await Promise.resolve();

    /* v8 ignore if -- defensive catch; the resolver routes on this name */
    if (resourceTypeName !== crossRegionParameterResourceTypeName) {
      throw crossRegionParameterError(
        resource.logicalId,
        `${resourceTypeName} is not a Resource type this factory deletes`,
      );
    }
  }

  /**
   * The parameter's value, or nothing where no Stack has written it.
   */
  private async read(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
    parameterName: string,
    regionName: AwsRegionName,
  ): Promise<string | undefined> {
    try {
      const output = await context.simAws
        .accountRegionScope(resource.accountRegionScope.accountId, regionName)
        .ssm()
        .getParameter({ input: { Name: parameterName } });

      return output.Parameter?.Value;
    } catch (error) {
      if (!(error instanceof SimSsmParameterNotFound)) {
        throw error;
      }

      resource.ignoreProperty(
        "ParameterName",
        `no simulated SSM parameter ${parameterName} has been written in ` +
          `${regionName}, so this Resource reads nothing. CDK writes that ` +
          `parameter from a support Stack of its own; deploy the whole cloud ` +
          `assembly with deployCdkOut to deploy that Stack too`,
      );

      return undefined;
    }
  }
}
