import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceInPlaceUpdateContext } from "../../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import {
  simCfnDynamoDbRunNow,
  simCfnDynamoDbRunPassingOver,
  simCfnDynamoDbRunReverting,
  simCfnDynamoDbTableUpdateCalls,
  type SimCfnDynamoDbTableRun,
} from "./sim-cfn-dynamodb-table-update-calls.js";
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
 * is activated here at the same points. Time to live and tags go through their
 * own commands.
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

    // Time to live is the change DynamoDB is likeliest to refuse, so it goes
    // first, and a refusal leaves the rest of the table as it was.
    await this.labels.updateTimeToLive(step);

    await simCfnDynamoDbRunReverting(
      async () => {
        await this.send(step);
        await this.labels.updateTags(step);
      },
      async () => this.revert(step),
    );

    return table;
  }

  /**
   * Send the UpdateTable calls that take the table from one definition to the
   * next, each through `run`.
   */
  private async send(
    step: SimCfnDynamoDbTableStep,
    run: SimCfnDynamoDbTableRun = simCfnDynamoDbRunNow,
  ): Promise<void> {
    const { table, options } = step;

    for (const call of simCfnDynamoDbTableUpdateCalls(
      step.before,
      step.after,
    )) {
      // oxlint-disable-next-line no-await-in-loop -- DynamoDB takes these one at a time.
      await run(async () => {
        await this.dynamoDb.updateTable(
          { input: { TableName: table.tableName, ...call.input } },
          options,
        );
        await call.settle(table);
      });
    }
  }

  /**
   * Put back what a failed update had already changed.
   *
   * The stack rolls back onto the definition it holds, which is the one this
   * update started from, so a change made here before the failure would
   * otherwise outlast the rollback. Each call back is sent on its own and a
   * refusal is passed over, since a call the update never reached asks for the
   * state the table is already in. A time to live changed within the hour
   * stays changed, since DynamoDB refuses a second change to it.
   */
  private async revert(step: SimCfnDynamoDbTableStep): Promise<void> {
    const back = { ...step, before: step.after, after: step.before };

    await this.send(back, simCfnDynamoDbRunPassingOver);
    await simCfnDynamoDbRunPassingOver(async () =>
      this.labels.updateTags(back),
    );
  }
}
