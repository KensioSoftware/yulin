/**
 * The AWS::Athena::WorkGroup properties this simulation has nothing to act on,
 * and why.
 *
 * Recorded as ignored rather than refused. A workgroup without any of them
 * still does what a workgroup does here, which is hold the settings a query
 * would run under and hand them back.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  ["Tags", "workgroup tags are not held or reported"],
  [
    "RecursiveDeleteOption",
    "a workgroup deleted with its Stack takes its named queries with it " +
      "whatever this says",
  ],
]);

/**
 * The AWS::Athena::WorkGroup WorkGroupConfiguration settings this simulation
 * holds without acting on, and why.
 *
 * These read back through GetWorkGroup exactly as the template set them. What
 * they would change about a query is what is missing, because no query runs.
 */
export const unsimulatedConfigurationReasons: ReadonlyMap<string, string> =
  new Map([
    [
      "AdditionalConfiguration",
      "no query engine reads it, so nothing it configures happens",
    ],
    [
      "CustomerContentEncryptionConfiguration",
      "nothing is written for a query, so nothing is encrypted",
    ],
    [
      "EnableMinimumEncryptionConfiguration",
      "result encryption is held rather than applied, so no minimum is " +
        "enforced",
    ],
    ["ExecutionRole", "no query runs, so no role is assumed to run one"],
    [
      "IdentityCenterConfiguration",
      "Identity Center is not simulated, and a request is authorized against " +
        "IAM here",
    ],
    [
      "QueryResultsS3AccessGrantsConfiguration",
      "S3 Access Grants are not simulated",
    ],
  ]);
