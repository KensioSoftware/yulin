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
  // How long a pinned port is waited for when something else still holds it.
  // A restart overlaps the process it replaces for a moment, and long enough to
  // outlast that is the whole requirement. Anything still holding the port after
  // this is not going to let go.
  portWaitMs: 2000,
  portWaitIntervalMs: 25,
};
