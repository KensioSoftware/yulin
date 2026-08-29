/**
 * The service principal Firehose reads and delivers as.
 *
 * A delivery stream's destination Role and its source Role are both trusted by
 * this principal, and it is what `iam:PassedToService` carries when a delivery
 * stream is created.
 */
export const simFirehoseServicePrincipal = "firehose.amazonaws.com";
