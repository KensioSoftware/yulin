import type { SimUpdateTableCommandInput } from "../../command/table/table.command.js";
import type { SimDynamoDbStreamSpecification } from "../../stream/sim-dynamodb-stream.types.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { simCfnDynamoDbTableValueDiffers } from "./sim-cfn-dynamodb-table-change.js";
import {
  simCfnDynamoDbIndexCapacityUpdates,
  simCfnDynamoDbIndexUpdates,
} from "./sim-cfn-dynamodb-table-index-updates.js";
import type { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";
import { simCfnDynamoDbTableSettings } from "./sim-cfn-dynamodb-table-settings.js";

/**
 * One UpdateTable a stack update sends, and what CloudFormation waits for
 * after it.
 */
export interface SimCfnDynamoDbTableUpdateCall {
  readonly input: Omit<SimUpdateTableCommandInput, "TableName">;
  readonly settle: (table: SimDynamoDbTable) => Promise<void>;
}

/**
 * CloudFormation waits for the table to be ACTIVE again.
 */
const activate = async (table: SimDynamoDbTable): Promise<void> =>
  table.activate();

/**
 * CloudFormation starts building an index and moves on, so the table is left
 * UPDATING until the background work has run.
 */
const moveOn = (): Promise<void> => Promise.resolve();

/**
 * How one change to a table is run.
 */
export type SimCfnDynamoDbTableRun = (
  change: () => Promise<void>,
) => Promise<void>;

/**
 * Run a change, letting a refusal fail the update.
 */
export const simCfnDynamoDbRunNow: SimCfnDynamoDbTableRun = async (change) =>
  change();

/**
 * Run a change while putting a table back, passing over a refusal.
 */
export const simCfnDynamoDbRunPassingOver: SimCfnDynamoDbTableRun = async (
  change,
) => {
  try {
    await change();
  } catch {
    // A change the failed update never made asks for the state the table is
    // already in, and DynamoDB refuses it.
  }
};

/**
 * Run a change, and put the table back before failing when it is refused.
 */
export async function simCfnDynamoDbRunReverting(
  change: () => Promise<void>,
  revert: () => Promise<void>,
): Promise<void> {
  try {
    await change();
  } catch (error) {
    await revert();
    throw error;
  }
}

/**
 * The UpdateTable calls that take a table from one definition to the next, in
 * the order they are sent.
 *
 * DynamoDB takes one billing or index change per call. A stream whose view
 * type changes is switched off in a call of its own first. The billing, index
 * capacity, class, deletion protection and stream changes share the next call,
 * and the one index created or deleted comes last.
 */
export function simCfnDynamoDbTableUpdateCalls(
  before: SimCfnDynamoDbTableProperties,
  after: SimCfnDynamoDbTableProperties,
): readonly SimCfnDynamoDbTableUpdateCall[] {
  const stream = streamChange(
    before.streamSpecification(),
    after.streamSpecification(),
  );
  const capacity = simCfnDynamoDbIndexCapacityUpdates(before, after);
  const settings = {
    ...simCfnDynamoDbTableSettings(before, after, stream.next),
    ...(capacity.length > 0 && { GlobalSecondaryIndexUpdates: capacity }),
  };
  const indexUpdates = simCfnDynamoDbIndexUpdates(
    before.globalSecondaryIndexes(),
    after.globalSecondaryIndexes(),
  ).slice(0, 1);

  return [
    ...(stream.switchOffFirst
      ? [
          {
            input: { StreamSpecification: { StreamEnabled: false } },
            settle: activate,
          },
        ]
      : []),
    ...(Object.keys(settings).length > 0
      ? [{ input: settings, settle: activate }]
      : []),
    ...indexUpdates.map((indexUpdate) => ({
      input: {
        AttributeDefinitions: after.attributeDefinitions(),
        GlobalSecondaryIndexUpdates: [indexUpdate],
      },
      settle: moveOn,
    })),
  ];
}

/**
 * The stream calls a change of StreamSpecification takes.
 *
 * Leaving the property out of a template switches the stream off. A stream
 * whose view type changes is switched off first, since DynamoDB refuses to
 * change the view type of a stream that is on.
 */
function streamChange(
  before: SimDynamoDbStreamSpecification | undefined,
  after: SimDynamoDbStreamSpecification | undefined,
): {
  readonly switchOffFirst: boolean;
  readonly next: SimDynamoDbStreamSpecification | undefined;
} {
  if (!simCfnDynamoDbTableValueDiffers(before, after)) {
    return { switchOffFirst: false, next: undefined };
  }

  if (after === undefined) {
    return { switchOffFirst: false, next: { StreamEnabled: false } };
  }

  return { switchOffFirst: before !== undefined, next: after };
}
