import http from "node:http";
import { simAwsLocalConfig } from "../../src/serve/http/local-server/sim-aws-local.config.js";

/**
 * Start a plain HTTP server on a free port, so a test has a port that something
 * else is holding.
 */
export async function listenOnFreePort(): Promise<http.Server> {
  const holder = http.createServer();

  await new Promise<void>((resolve) => {
    holder.listen(0, simAwsLocalConfig.loopbackAddress, resolve);
  });

  return holder;
}

/**
 * Read the TCP port a server took.
 */
export function serverPort(server: http.Server): number {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new TypeError("Expected the server to listen on a TCP port");
  }

  return address.port;
}
