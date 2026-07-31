import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simDynamoDbTableArn } from "../../table/sim-dynamodb-table-arn.js";

interface SimDynamoDbAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to DynamoDB requests.
 *
 * AWS maps each DynamoDB API operation to the `dynamodb:` action of the same
 * name, and the resource is the ARN of the table the operation names. ListTables
 * is the exception: it names no table, so it authorizes against `*`.
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
   */
  authorizeTable(
    action: string,
    tableName: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      simDynamoDbTableArn(this.accountRegionScope, tableName),
      caller,
    );
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
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource,
      });
    }

    return decision.caller;
  }
}
