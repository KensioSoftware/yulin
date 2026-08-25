import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simGlueCatalogArn } from "../../arn/sim-glue-arn.js";
import { authorizeSimGlueResources } from "./sim-glue-authorize-resources.js";
import {
  simGlueDatabaseDeletionResources,
  simGlueDatabaseResources,
  simGlueTableResources,
} from "../../arn/sim-glue-authorized-resources.js";

interface SimGlueAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to Glue requests.
 *
 * Data Catalog resources are a hierarchy with the catalog at the root, and an
 * operation on one needs permission on that resource and on every ancestor of
 * it. Reading a table needs the table, the database and the catalog, and a
 * policy naming only the table ARN is denied. Deleting a database also needs
 * permission on every table in it.
 *
 * That rule is why each method authorizes a list. A policy written for real
 * Glue already names the ancestors, and one that names only the leaf fails the
 * same way in both places.
 */
export class SimGlueAuthorizer {
  readonly #iam: SimIamInterServiceAuthZ;
  readonly #scope: SimAwsAccountRegionScope;

  constructor(properties: SimGlueAuthorizerProperties) {
    this.#iam = properties.iam;
    this.#scope = properties.accountRegionScope;
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
      simGlueDatabaseResources(this.#scope, databaseName),
      caller,
    );
  }

  /** Ensure the caller may perform an action on a table. */
  authorizeTable(
    action: string,
    databaseName: string,
    tableName: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.#authorize(
      action,
      simGlueTableResources(this.#scope, databaseName, tableName),
      caller,
    );
  }

  /** Ensure the caller may delete a database holding these tables. */
  authorizeDatabaseDeletion(
    databaseName: string,
    tableNames: readonly string[],
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.#authorize(
      "glue:DeleteDatabase",
      simGlueDatabaseDeletionResources(this.#scope, databaseName, tableNames),
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action naming no particular database.
   *
   * The catalog has no ancestor, so it is the whole of the list.
   */
  authorizeCatalog(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.#authorize(action, [simGlueCatalogArn(this.#scope)], caller);
  }

  #authorize(
    action: string,
    resources: readonly string[],
    caller: SimAwsCaller | undefined,
  ): SimAwsResolvedCaller {
    return authorizeSimGlueResources({
      iam: this.#iam,
      action,
      resources,
      caller,
    });
  }
}
