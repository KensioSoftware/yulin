import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceInPlaceUpdateContext } from "../../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { simCfnDynamoDbTableUpdateCalls } from "./sim-cfn-dynamodb-table-update-calls.js";
import {
  SimCfnDynamoDbTableLabels,
  type SimCfnDynamoDbTableStep,
} from "./sim-cfn-dynamodb-table-labels.js";
import { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";

interface SimCfnDynamoDbTableUpdaterProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * Applies a changed AWS::DynamoDB::Table Resource to the deployed table.
 *
 * Real CloudFormation changes a table in place for everything but its name,
 * its key schema and its local secondary indexes, so the items it holds survive
 * the update. Each change goes through the ordinary DynamoDB commands, in the
 * order and the number of calls DynamoDB takes them in. UpdateTable takes one
 * billing or index change per call, and a stream's view type changes by
 * switching the stream off and on again.
 *
 * CloudFormation waits for the table to be ACTIVE between calls, and the table
 * is activated here at the same points. Time to live and tags go last, through
 * their own commands.
 */
export class SimCfnDynamoDbTableUpdater {
  private readonly dynamoDb: SimDynamoDb;
  private readonly labels: SimCfnDynamoDbTableLabels;

  constructor(properties: SimCfnDynamoDbTableUpdaterProperties) {
    this.dynamoDb = properties.dynamoDb;
    this.labels = new SimCfnDynamoDbTableLabels(properties);
  }

  /**
   * Apply the new Resource definition to the deployed table.
   */
  async update(
    current: SimCfnResource,
    updated: SimCfnResource,
    context: SimCloudFormationResourceInPlaceUpdateContext,
  ): Promise<SimDynamoDbTable> {
    const table = current.simResource as SimDynamoDbTable | undefined;
    assertDefined(
      table,
      `sim DynamoDB table for CloudFormation Resource ${current.logicalId}`,
    );

    const after = new SimCfnDynamoDbTableProperties({
      resource: updated,
      properties: context.updatedResolvedProperties,
    });
    after.applyPropertyRules();

    const step: SimCfnDynamoDbTableStep = {
      table,
      before: new SimCfnDynamoDbTableProperties({
        resource: current,
        properties: context.currentResolvedProperties,
      }),
      after,
      options: simCfnResourceCallerOptions(context.caller),
    };

    await table.activate();

    for (const call of simCfnDynamoDbTableUpdateCalls(step.before, after)) {
      // oxlint-disable-next-line no-await-in-loop -- DynamoDB takes these one at a time.
      await this.dynamoDb.updateTable(
        { input: { TableName: table.tableName, ...call.input } },
        step.options,
      );
      // oxlint-disable-next-line no-await-in-loop -- each waits on the call before it.
      await call.settle(table);
    }

    await this.labels.update(step);

    return table;
  }
}
