import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimKinesis } from "../sim-kinesis.js";
import type { SimKinesisStream } from "../stream/sim-kinesis-stream.js";

interface SimCfnKinesisResourceDeleterProperties {
  readonly kinesis: SimKinesis;
}

/**
 * Deletes the simulated Kinesis resources a CloudFormation Stack created.
 */
export class SimCfnKinesisResourceDeleter {
  private readonly kinesis: SimKinesis;

  constructor(properties: SimCfnKinesisResourceDeleterProperties) {
    this.kinesis = properties.kinesis;
  }

  /**
   * Delete a simulated Kinesis resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    if (resourceTypeName !== "Stream") {
      throw new Error(
        `Unsupported sim Kinesis CloudFormation Resource ${resourceTypeName} deletion`,
      );
    }

    const stream = resource.simResource as SimKinesisStream | undefined;
    assertDefined(
      stream,
      `sim Kinesis stream for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.kinesis.deleteStream({ input: { StreamARN: stream.arn } });
  }
}
