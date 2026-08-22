import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimKinesis } from "../../sim-kinesis.js";
import { simKinesisDefaultRetentionHours } from "../../stream/sim-kinesis-retention.js";
import type { SimKinesisStream } from "../../stream/sim-kinesis-stream.js";
import { simCfnKinesisResourceCreation } from "../sim-cfn-kinesis-resource-error.js";
import { kinesisStreamResourceType } from "../sim-cfn-kinesis-resource-types.js";
import { SimCfnKinesisStreamProperties } from "./sim-cfn-kinesis-stream-properties.js";

interface SimCfnKinesisStreamCreatorProperties {
  readonly kinesis: SimKinesis;
}

/**
 * Creates simulated streams from AWS::Kinesis::Stream Resources.
 *
 * The stream goes through the ordinary CreateStream command rather than being
 * constructed directly, so a stream a template deployed is the same thing an
 * SDK caller would have got: the same name validation, the same shard map, the
 * same refusals for what this simulation does not model.
 *
 * Retention goes the same way. CreateStream takes no retention, on real Kinesis
 * or here, so a template asking for more than the default is a second call, as
 * it is for CloudFormation itself.
 */
export class SimCfnKinesisStreamCreator {
  private readonly kinesis: SimKinesis;

  constructor(properties: SimCfnKinesisStreamCreatorProperties) {
    this.kinesis = properties.kinesis;
  }

  /**
   * Create a stream from an AWS::Kinesis::Stream Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimKinesisStream> {
    const streamProperties = new SimCfnKinesisStreamProperties({
      resource,
      properties,
    });
    const name = streamProperties.name();
    const shardCount = streamProperties.shardCount();
    const streamMode = streamProperties.streamMode();
    const tags = streamProperties.tags();
    const retentionHours = streamProperties.retentionHours();

    return await simCfnKinesisResourceCreation(
      kinesisStreamResourceType,
      resource.logicalId,
      async () => {
        await this.kinesis.createStream({
          input: {
            StreamName: name,
            ...(shardCount !== undefined && { ShardCount: shardCount }),
            ...(streamMode !== undefined && {
              StreamModeDetails: { StreamMode: streamMode },
            }),
            ...(tags !== undefined && { Tags: tags }),
          },
        });

        await this.applyRetention(name, retentionHours);

        const stream = this.kinesis.findStream(name);
        assertDefined(
          stream,
          `sim Kinesis stream ${name} after CloudFormation creation`,
        );

        return stream;
      },
    );
  }

  /**
   * Move the stream's retention up to what the template asked for.
   *
   * Only ever upwards. A new stream keeps records for 24 hours, and that is
   * also the least Kinesis accepts, so a template can ask for more or for the
   * same and never for less. A template asking for the same asks for no change,
   * which is just as well: real Kinesis refuses an increase to what the stream
   * already keeps.
   */
  private async applyRetention(
    name: string,
    retentionHours: number | undefined,
  ): Promise<void> {
    if (
      retentionHours === undefined ||
      retentionHours <= simKinesisDefaultRetentionHours
    ) {
      return;
    }

    await this.kinesis.increaseStreamRetentionPeriod({
      input: { StreamName: name, RetentionPeriodHours: retentionHours },
    });
  }
}
