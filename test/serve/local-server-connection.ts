import { once } from "node:events";
import net from "node:net";
import { simAwsLocalConfig } from "../../src/serve/http/local-server/sim-aws-local.config.js";

// Node leaves an idle keep-alive connection open for five seconds by default,
// so anything shorter than that proves the server ended the connection itself
// rather than a timeout getting there first.
const connectionEndWaitMs = 1000;

const requestStart = `GET / HTTP/1.1\r\nHost: ${simAwsLocalConfig.hostname}\r\n`;

/**
 * Connect, make one request, and leave the connection open afterwards, the way
 * a browser holds on to a connection between page loads.
 */
export async function keepAliveConnection(port: number): Promise<net.Socket> {
  const socket = net.createConnection({
    host: simAwsLocalConfig.loopbackAddress,
    port,
  });
  await once(socket, "connect");

  await write(socket, `${requestStart}Connection: keep-alive\r\n\r\n`);
  await once(socket, "data");

  return socket;
}

/**
 * Send the start of a request without finishing it, leaving the server holding
 * a connection that is in use rather than idle.
 */
export async function startAnotherRequest(socket: net.Socket): Promise<void> {
  await write(socket, requestStart);

  // Flushing the write only means the bytes left this end. Give the server a
  // moment to read them, so the connection is in use by the time it closes.
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

/**
 * Require that an open connection ends promptly, rather than being left for the
 * client or a timeout to deal with.
 */
export async function assertConnectionEnds(socket: net.Socket): Promise<void> {
  try {
    await once(socket, "close", {
      signal: AbortSignal.timeout(connectionEndWaitMs),
    });
  } catch {
    throw new Error(
      `Connection was still open ${String(connectionEndWaitMs)}ms after the server closed`,
    );
  }
}

async function write(socket: net.Socket, text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(text, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
