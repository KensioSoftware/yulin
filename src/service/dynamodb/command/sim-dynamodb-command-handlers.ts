import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimDynamoDbTableStore } from "../table/sim-dynamodb-table-store.js";
import { SimDynamoDbAuthorizer } from "./authorize/sim-dynamodb-authorizer.js";
import { SimDynamoDbBatchGetItem } from "./batch/sim-dynamodb-batch-get-item.js";
import { SimDynamoDbBatchWriteItem } from "./batch/sim-dynamodb-batch-write-item.js";
import { SimDynamoDbDeleteItem } from "./item/sim-dynamodb-delete-item.js";
import { SimDynamoDbGetItem } from "./item/sim-dynamodb-get-item.js";
import { SimDynamoDbPutItem } from "./item/sim-dynamodb-put-item.js";
import { SimDynamoDbUpdateItem } from "./item/sim-dynamodb-update-item.js";
import { SimDynamoDbTagCommands } from "./tag/sim-dynamodb-tag-commands.js";
import { SimDynamoDbCreateTable } from "./table/sim-dynamodb-create-table.js";
import { SimDynamoDbTableAccess } from "./table/sim-dynamodb-table-access.js";
import { SimDynamoDbTableCommands } from "./table/sim-dynamodb-table-commands.js";
import { SimDynamoDbTransactGetItems } from "./transact/sim-dynamodb-transact-get-items.js";
import { SimDynamoDbTransactWriteItems } from "./transact/sim-dynamodb-transact-write-items.js";

interface SimDynamoDbCommandHandlersProperties {
  readonly tables: SimDynamoDbTableStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * The command handlers of one simulated DynamoDB, grouped by what they work on.
 *
 * Every one of them authorizes against the same IAM and reaches the same table
 * store, so they are wired together here rather than one at a time in the
 * service facade. That keeps `SimDynamoDb` what it should be: state plus
 * delegation.
 */
export class SimDynamoDbCommandHandlers {
  public readonly access: SimDynamoDbTableAccess;
  public readonly tableCreation: SimDynamoDbCreateTable;
  public readonly tables: SimDynamoDbTableCommands;
  public readonly itemWrites: SimDynamoDbPutItem;
  public readonly itemReads: SimDynamoDbGetItem;
  public readonly itemDeletions: SimDynamoDbDeleteItem;
  public readonly itemUpdates: SimDynamoDbUpdateItem;
  public readonly itemBatchWrites: SimDynamoDbBatchWriteItem;
  public readonly itemBatchReads: SimDynamoDbBatchGetItem;
  public readonly itemTransactWrites: SimDynamoDbTransactWriteItems;
  public readonly itemTransactReads: SimDynamoDbTransactGetItems;
  public readonly tags: SimDynamoDbTagCommands;

  constructor(properties: SimDynamoDbCommandHandlersProperties) {
    const { tables, accountRegionScope, background } = properties;
    const authorizer = new SimDynamoDbAuthorizer({
      iam: properties.iam,
      accountRegionScope,
    });
    const access = new SimDynamoDbTableAccess({
      tables,
      authorizer,
      accountRegionScope,
    });

    this.access = access;
    this.tableCreation = new SimDynamoDbCreateTable({
      tables,
      authorizer,
      accountRegionScope,
      background,
    });
    this.tables = new SimDynamoDbTableCommands({ tables, access, background });
    this.itemWrites = new SimDynamoDbPutItem({ access });
    this.itemReads = new SimDynamoDbGetItem({ access });
    this.itemDeletions = new SimDynamoDbDeleteItem({ access });
    this.itemUpdates = new SimDynamoDbUpdateItem({ access });
    this.itemBatchWrites = new SimDynamoDbBatchWriteItem({ access });
    this.itemBatchReads = new SimDynamoDbBatchGetItem({ access });
    this.itemTransactWrites = new SimDynamoDbTransactWriteItems({
      access,
      clock: background,
    });
    this.itemTransactReads = new SimDynamoDbTransactGetItems({ access });
    this.tags = new SimDynamoDbTagCommands({ access });
  }
}
