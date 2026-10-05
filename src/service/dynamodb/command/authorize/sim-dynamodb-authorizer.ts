import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simDynamoDbReadArn } from "../../table/sim-dynamodb-table-arn.js";
import type { SimDynamoDbReached } from "./sim-dynamodb-reached.js";
import { simDynamoDbConditionContextOf } from "./sim-dynamodb-reached.js";

interface SimDynamoDbAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to DynamoDB requests.
 *
 * AWS maps each DynamoDB API operation to the `dynamodb:` action of the same
 * name, and the resource is the ARN of the table the operation names. ListTables
 * is the exception: it names no table, so it authorizes against `*`. A Query or
 * Scan naming an `IndexName` authorizes against the index's own ARN.
 */
export class SimDynamoDbAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimDynamoDbAuthorizerProperties) {
    this.iam = properties.iam;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a table, named by its name.
   *
   * The table need not exist. Real IAM evaluates a request before the service
   * handles it, so a caller with no permission is refused whether or not the
   * table is there, which also keeps an unauthorized caller from finding out
   * which table names are taken.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   *
   * A request reaching one of the table's indexes is authorized against the
   * index's ARN. The service authorization reference for DynamoDB gives Query and Scan two
   * resource types, `table` and `index`. The `index` ARN is the table's with
   * `/index/<name>` after it. The developer guide's fine-grained access control
   * page grants index queries on that ARN (its examples 5 and 6). A read naming
   * an index is authorized against the index ARN alone. A statement naming only
   * the table refuses it, and one naming only an index does not reach the
   * table. CDK's `grantReadData` adds `<table ARN>/index/*` only for a table it
   * knows has indexes, and a grant on a table imported by name covers none.
   *
   * The reference also lists `index` for PartiQLSelect, SearchVectors and the
   * contributor insights actions, none of which are simulated. DescribeTable
   * and the item actions take `table` only.
   *
   * The condition keys are the ones the action supplies on the table, with
   * the partition key values read through the index's own key schema.
   */
  authorizeTable(
    action: string,
    tableName: string,
    caller?: SimAwsCaller,
    reached: SimDynamoDbReached = {},
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      simDynamoDbReadArn(this.accountRegionScope, tableName, reached.indexName),
      caller,
      reached,
    );
  }

  /**
   * Ensure the caller may perform an action on a table's stream.
   *
   * The resource is the stream's own ARN, which is the table's ARN and then
   * the stream's label, so a statement naming only the table does not reach it.
   * The ARN comes from the request rather than being built here: a stream is
   * named by an ARN a caller was handed, and one naming no stream is refused
   * before anything looks it up, as real IAM refuses a request before the
   * service sees it.
   */
  authorizeStream(
    action: string,
    streamArn: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, streamArn, caller);
  }

  /**
   * Ensure the caller may perform an action that names no particular table.
   *
   * Authorization applies to the whole operation. A denied caller receives
   * AccessDenied rather than an empty or filtered table listing.
   */
  authorizeAnyTable(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, "*", caller);
  }

  private authorizeResource(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
    reached: SimDynamoDbReached = {},
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action,
      resource,
      caller,
      conditionContext: simDynamoDbConditionContextOf(reached),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }

    return decision.caller;
  }
}
