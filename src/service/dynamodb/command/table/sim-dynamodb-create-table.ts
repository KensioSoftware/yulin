import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbResourceInUseException } from "../../error/dynamodb.error.js";
import { SimDynamoDbGlobalSecondaryIndexes } from "../../secondary-index/sim-dynamodb-global-secondary-indexes.js";
import { SimDynamoDbAttributeDefinitions } from "../../table/sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbKeySchema } from "../../table/sim-dynamodb-key-schema.js";
import { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { simDynamoDbTableArn } from "../../table/sim-dynamodb-table-arn.js";
import { SimDynamoDbTableBilling } from "../../table/sim-dynamodb-table-billing.js";
import { readSimDynamoDbTableClass } from "../../table/sim-dynamodb-table-class.js";
import { SimDynamoDbTableName } from "../../table/sim-dynamodb-table-name.js";
import { SimDynamoDbTableTags } from "../../table/sim-dynamodb-table-tags.js";
import type { SimDynamoDbTableStore } from "../../table/sim-dynamodb-table-store.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";
import type {
  SimCreateTableCommand,
  SimCreateTableCommandInput,
  SimCreateTableCommandOutput,
} from "./table.command.js";
import { refuseUnsimulatedTableInput } from "./sim-dynamodb-unsimulated-table-input.js";

interface SimDynamoDbCreateTableProperties {
  readonly tables: SimDynamoDbTableStore;
  readonly authorizer: SimDynamoDbAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
}

interface SimDynamoDbCreateTableOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The CreateTable command.
 *
 * Everything the request says about the table is checked before the table is
 * made, and the table then reports it back. A table that could not have been
 * created on AWS is not created here, and one that could is described the way
 * AWS describes it, so what a test reads off the response is what a deployment
 * would read.
 *
 * The whole command runs in one turn. Nothing is awaited between finding the
 * name free and taking it, so two creates racing for the same name cannot both
 * get it.
 */
export class SimDynamoDbCreateTable {
  private readonly tables: SimDynamoDbTableStore;
  private readonly authorizer: SimDynamoDbAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimDynamoDbCreateTableProperties) {
    this.tables = properties.tables;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
    this.background = properties.background;
  }

  /**
   * Create a table, and describe it as it is being created.
   */
  handle(
    command: SimCreateTableCommand,
    options?: SimDynamoDbCreateTableOptions,
  ): SimCreateTableCommandOutput {
    const input = command.input;

    refuseUnsimulatedTableInput(input);

    const name = SimDynamoDbTableName.required(input.TableName);

    this.authorizer.authorizeTable(
      "dynamodb:CreateTable",
      name.value,
      options?.caller,
    );

    return {
      TableDescription: this.created(name, input).toDescription(),
      $metadata: {},
    };
  }

  /**
   * Create the table itself, once the request has been accepted.
   *
   * Everything the request says is read and checked before the name is taken,
   * so a request that fails validation leaves no half-made table behind.
   */
  private created(
    name: SimDynamoDbTableName,
    input: SimCreateTableCommandInput,
  ): SimDynamoDbTable {
    const table = this.tableFrom(name, input);

    if (this.tables.has(name)) {
      throw new SimDynamoDbResourceInUseException(
        `DynamoDB Table ${name.value} already exists`,
      );
    }

    this.tables.add(table);
    this.background.schedule(() => table.activate());

    return table;
  }

  /**
   * Build the table a request describes, checking what it describes.
   *
   * The indexes are read before the attribute definitions, since the
   * definitions have to match every key schema the request carries and the
   * indexes are where the rest of those are.
   */
  private tableFrom(
    name: SimDynamoDbTableName,
    input: SimCreateTableCommandInput,
  ): SimDynamoDbTable {
    const arn = simDynamoDbTableArn(this.accountRegionScope, name.value);
    const keySchema = SimDynamoDbKeySchema.fromInput(input.KeySchema);
    const billing = SimDynamoDbTableBilling.fromInput(input);
    const indexes = SimDynamoDbGlobalSecondaryIndexes.fromInput(
      input.GlobalSecondaryIndexes,
      { tableArn: arn, billing },
    );
    const attributeDefinitions = SimDynamoDbAttributeDefinitions.fromInput(
      input.AttributeDefinitions,
    );
    attributeDefinitions.assertMatches([keySchema, ...indexes.keySchemas()]);

    return new SimDynamoDbTable({
      name,
      arn,
      keySchema,
      attributeDefinitions,
      billing,
      indexes,
      tableClass: readSimDynamoDbTableClass(input.TableClass),
      deletionProtectionEnabled: input.DeletionProtectionEnabled,
      tags: SimDynamoDbTableTags.fromInput(input.Tags),
      background: this.background,
    });
  }
}
