import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListTablesCommand,
  SimListTablesCommandOutput,
} from "./list-tables.cmd.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTable,
} from "../../table/sim-dynamodb-table.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { ListTablesAuthorizer } from "./list-tables-authorizer.js";

interface ListTablesCommandHandlerProps {
  readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListTablesCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated DynamoDB ListTablesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/ListTablesCommand/
 */
export class ListTablesCommandHandler implements CommandHandler<
  SimListTablesCommand,
  SimListTablesCommandOutput
> {
  private readonly tables: Map<DynamoDbTableName, SimDynamoDbTable>;
  private readonly authorizer: ListTablesAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(props: ListTablesCommandHandlerProps) {
    const {
      tables,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;
    this.tables = tables;
    this.authorizer = new ListTablesAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Simulate listing DynamoDB Tables.
   */
  async handle(
    cmd: SimListTablesCommand,
    opts?: ListTablesCommandHandlerOptions,
  ): Promise<SimListTablesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(opts?.caller);

    const tables = this.tables.values().toArray();
    tables.sort((a, b) => a.tableName.localeCompare(b.tableName));

    const exclusiveStartTableName = cmd.input.ExclusiveStartTableName;
    const limit = cmd.input.Limit ?? 100;

    const startIndex =
      exclusiveStartTableName === undefined
        ? 0
        : Math.max(
            0,
            tables.findIndex((t) => t.tableName === exclusiveStartTableName) +
              1,
          );

    const page = tables.slice(startIndex, startIndex + limit);

    return {
      TableNames: page.map((table) => table.tableName),
      LastEvaluatedTableName: page.at(-1)?.tableName,
      $metadata: {},
    };
  }
}
