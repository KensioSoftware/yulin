/**
 * Default configuration for serving simulated AWS on localhost.
 */
export const simAwsLocalConfig = {
  hostname: "sim-aws.localhost",
  defaultPort: 0,
  // The address the local servers bind, and the address DNS answers with for
  // names that resolve to a simulated service, so a lookup and an HTTP request
  // for the same name reach the same place.
  loopbackAddress: "127.0.0.1",
};
