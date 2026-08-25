/**
 * The AWS::Glue::Database DatabaseInput properties this simulation has nothing
 * to act on, and why.
 *
 * Each of them points the database somewhere outside this account's catalog,
 * or grants something on it. Nothing here federates or authorizes at that
 * level, so a database carrying one is created without it.
 */
export const unsimulatedDatabaseInputReasons: ReadonlyMap<string, string> =
  new Map([
    [
      "CreateTableDefaultPermissions",
      "Lake Formation permissions are not simulated, so nothing is granted " +
        "on a table created in this database",
    ],
    [
      "TargetDatabase",
      "a database linking to another catalog's database is not simulated, so " +
        "this one holds only the tables created in it",
    ],
    [
      "FederatedDatabase",
      "no federated source is reached, so a federated database holds nothing",
    ],
  ]);
