import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  simGlueCatalogArn,
  simGlueDatabaseArn,
  simGlueTableArn,
} from "../../arn/sim-glue-arn.js";

interface SimGlueAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to Glue requests.
 *
 * An operation on one database or table authorizes against that resource's own
 * ARN. Real Glue policies also name the catalog on most of these actions, and
 * a policy written that way still passes here, since a policy granting more
 * than the simulation checks is never the reason a request fails.
 */
export class SimGlueAuthorizer {
  readonly #iam: SimIamInterServiceAuthZ;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimGlueAuthorizerProperties) {
    this.#iam = properties.iam;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a database.
   *
   * The database need not exist. Real IAM evaluates a request before the
   * service handles it, so a caller with no permission is refused whether or
   * not the database is there.
   */
  authorizeDatabase(
    action: string,
    databaseName: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.#authorize(
      action,
      simGlueDatabaseArn(this.#accountRegionScope, databaseName),
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action on a table.
   */
  authorizeTable(
    action: string,
    databaseName: string,
    tableName: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.#authorize(
      action,
      simGlueTableArn(this.#accountRegionScope, databaseName, tableName),
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action that names no particular database.
   *
   * The resource is the catalog, which is what such a request reaches.
   */
  authorizeCatalog(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.#authorize(
      action,
      simGlueCatalogArn(this.#accountRegionScope),
      caller,
    );
  }

  #authorize(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.#iam.authorize({ action, resource, caller });

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
