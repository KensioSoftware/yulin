import net from "node:net";
import { assertStringEndsWith, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAwsLocalServer } from "./sim-aws-local-server.js";

describe("SimAwsLocalServer", () => {
  it("responds HTTP 400 when request processing rejects", async () => {
    const localServer = new SimAwsLocalServer();
    const server = await localServer.listen(0);

    try {
      const responseText = await sendRawHttpRequest(
        Number(server.port),
        "GET / HTTP/1.0\r\n\r\n",
      );

      assertStringIncludes(responseText, "HTTP/1.1 400 Bad Request");
      assertStringIncludes(
        responseText,
        "local sim server nodeRequest.headers.host required",
      );
    } finally {
      server.close();
    }
  });

  it("sets a plain text response for request processing errors", async () => {
    const localServer1 = new SimAwsLocalServer();
    const server = await localServer1.listen(0);

    try {
      const responseText = await sendRawHttpRequest(
        Number(server.port),
        "GET / HTTP/1.0\r\n\r\n",
      );

      assertStringIncludes(
        responseText.toLowerCase(),
        "content-type: text/plain; charset=utf-8",
      );
      assertStringEndsWith(
        responseText,
        "local sim server nodeRequest.headers.host required",
      );
    } finally {
      server.close();
    }
  });
});

function sendRawHttpRequest(
  port: number,
  requestText: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: "localhost", port }, () => {
      socket.end(requestText);
    });

    let responseText = "";

    socket.setEncoding("utf8");

    socket.on("data", (chunk) => {
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      responseText += chunk;
    });

    socket.on("error", reject);

    socket.on("end", () => {
      resolve(responseText);
    });
  });
}
