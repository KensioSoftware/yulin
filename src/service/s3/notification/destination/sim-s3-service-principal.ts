/**
 * The service principal S3 reaches a notification destination as.
 *
 * Every destination's resource policy is written for this, so it lives beside
 * the destinations rather than inside one of them.
 */
export const simS3ServicePrincipal = "s3.amazonaws.com";
