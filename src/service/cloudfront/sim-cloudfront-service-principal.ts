/**
 * The service principal CloudFront reaches an Origin as.
 *
 * A Bucket policy written for an origin access control grants this principal,
 * so it lives at the service root rather than inside the S3 Origin that uses
 * it today.
 */
export const simCloudFrontServicePrincipal = "cloudfront.amazonaws.com";
