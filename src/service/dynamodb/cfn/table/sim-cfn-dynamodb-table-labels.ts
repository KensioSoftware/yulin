import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimDynamoDbTimeToLiveSpecificationInput } from "../../command/time-to-live/time-to-live.types.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { simCfnDynamoDbTableValueDiffers } from "./sim-cfn-dynamodb-table-change.js";
import type { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";

interface SimCfnDynamoDbTableLabelsProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * The deployed table, and the two definitions one update moves it between.
 */
export interface SimCfnDynamoDbTableStep {
  readonly table: SimDynamoDbTable;
  readonly before: SimCfnDynamoDbTableProperties;
  readonly after: SimCfnDynamoDbTableProperties;
  readonly options: SimCfnResourceCallerOptions;
}

/**
 * Applies a changed time to live and changed tags to a deployed table.
 *
 * Neither goes through UpdateTable on real DynamoDB, so neither waits for the
 * table to be ACTIVE. Each change takes the command an SDK caller would send,
 * so its refusals are DynamoDB's own. A time to live switched on or off twice
 * within an hour is refused, which fails the stack update on AWS too.
 */
export class SimCfnDynamoDbTableLabels {
  private readonly dynamoDb: SimDynamoDb;

  constructor(properties: SimCfnDynamoDbTableLabelsProperties) {
    this.dynamoDb = properties.dynamoDb;
  }

  /**
   * Apply the time to live and the tags the new definition asks for.
   */
  async update(step: SimCfnDynamoDbTableStep): Promise<void> {
    await this.updateTimeToLive(step);
    await this.updateTags(step);
  }

  /**
   * Switch time to live off for the old attribute and on for the new one.
   *
   * A template naming a different attribute takes both calls.
   */
  private async updateTimeToLive(step: SimCfnDynamoDbTableStep): Promise<void> {
    const before = step.before.timeToLiveSpecification();
    const after = step.after.timeToLiveSpecification();
    const wasOn = before?.Enabled === true;
    const isOn = after?.Enabled === true;
    const renamed = before?.AttributeName !== after?.AttributeName;

    if (wasOn && (!isOn || renamed)) {
      await this.sendTimeToLive(step, {
        AttributeName: before.AttributeName,
        Enabled: false,
      });
    }

    if (isOn && (!wasOn || renamed)) {
      await this.sendTimeToLive(step, after);
    }
  }

  private async sendTimeToLive(
    step: SimCfnDynamoDbTableStep,
    specification: SimDynamoDbTimeToLiveSpecificationInput,
  ): Promise<void> {
    await this.dynamoDb.updateTimeToLive(
      {
        input: {
          TableName: step.table.tableName,
          TimeToLiveSpecification: specification,
        },
      },
      step.options,
    );
  }

  /**
   * Remove the tags the template dropped, and write the ones it holds.
   */
  private async updateTags(step: SimCfnDynamoDbTableStep): Promise<void> {
    const before = step.before.tags();
    const after = step.after.tags();

    if (!simCfnDynamoDbTableValueDiffers(before, after)) {
      return;
    }

    const kept = new Set(after.map((tag) => tag.Key));
    const removed = before.flatMap(({ Key }) =>
      Key === undefined || kept.has(Key) ? [] : [Key],
    );

    if (removed.length > 0) {
      await this.dynamoDb.untagResource(
        { input: { ResourceArn: step.table.arn, TagKeys: removed } },
        step.options,
      );
    }

    if (after.length > 0) {
      await this.dynamoDb.tagResource(
        { input: { ResourceArn: step.table.arn, Tags: after } },
        step.options,
      );
    }
  }
}
