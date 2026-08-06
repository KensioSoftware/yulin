import type { Server } from "node:http";

/**
 * Read the TCP port a Node server took.
 *
 * A server that has not started listening has no port, and one listening on a
 * Unix socket has an address that is not a port at all. Neither is a number to
 * return, so both are refused rather than guessed at.
 */
export function nodeServerPort(server: Server): string {
  if (!server.listening) {
    throw new Error("Server is not yet listening, cannot get port number");
  }

  const address = server.address();

  /* v8 ignore if -- does not happen in practice */
  if (address === null || typeof address === "string") {
    throw new Error("Expected local HTTP server to listen on a TCP port");
  }

  return String(address.port);
}
