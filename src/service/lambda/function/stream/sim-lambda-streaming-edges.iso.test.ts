import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { grantPublicFunctionUrl } from "../../../../../test/lambda/public-url-fixture.js";
import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../code/make-lambda-code-zip.js";

/**
 * A simulation on a stopped clock holding one function of the code given,
 * behind a public streaming Function URL.
 */
async function simAwsStreaming(
  code: string,
): Promise<{ simAws: SimAws; url: string }> {
  const simAws = new SimAws();
  simAws.clock().freeze();
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "streamer",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/StreamerRole`,
      Handler: "index.handler",
      Code: { ZipFile: makeLambdaCodeZip(code) },
    }),
  );
  const { FunctionUrl } = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "streamer",
      AuthType: "NONE",
      InvokeMode: "RESPONSE_STREAM",
    }),
  );
  await grantPublicFunctionUrl(simAws.lambda(), "streamer");
  await simAws.backgroundTasksComplete();

  return {
    simAws,
    url: new SimAwsLocalUrl({ input: FunctionUrl }).toString(),
  };
}

function streaming(body: string): string {
  return (
    "exports.handler = awslambda.streamifyResponse(" +
    `async (event, response) => {\n${body}\n});\n`
  );
}

describe("the edges of a streaming handler", () => {
  it("keeps what was written when the writer reuses its buffer", async () => {
    // Given a handler that changes its buffer once the write has completed.
    const { simAws } = await simAwsStreaming(
      streaming(
        '  const buffer = Buffer.from("A");\n' +
          "  await new Promise((resolve) => response.write(buffer, resolve));\n" +
          '  buffer.write("B");\n' +
          "  response.end();",
      ),
    );

    // When it is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "streamer" }));

    // Then the response holds what was written.
    assertNonNullable(output.Payload);
    assertIdentical(Buffer.from(output.Payload).toString(), "A");
  });

  it("fails the invocation of a handler that destroys its stream", async () => {
    // Given a handler destroying its stream with an error.
    const { simAws } = await simAwsStreaming(
      streaming(
        '  response.destroy(new Error("broken"));\n' +
          "  await Promise.resolve();",
      ),
    );

    // When it is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "streamer" }));

    // Then the invocation failed with the error.
    assertIdentical(output.FunctionError, "Unhandled");
  });

  it("answers a prelude's bodyless status with no body", async () => {
    // Given a handler answering 204.
    const { simAws, url } = await simAwsStreaming(
      streaming(
        "  awslambda.HttpResponseStream.from(response, { statusCode: 204 })" +
          ".end();",
      ),
    );

    // When the URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(url);

    // Then it answered 204 with no body.
    assertResponseStatus(response, 204, await describeResponse(response));
    assertIdentical(await response.text(), "");
  });

  it("stops forwarding to a reader that cancels", async () => {
    // Given a handler writing, waiting, and writing again.
    const { simAws, url } = await simAwsStreaming(
      streaming(
        '  response.write("first");\n' +
          "  await new Promise((resolve) => setTimeout(resolve, 1000));\n" +
          '  response.end("second");',
      ),
    );

    // When the reader takes the first chunk, cancels, and the handler goes
    // on.
    const response = await new SimAwsHttp({ simAws }).fetch(url);
    const body = response.body as ReadableStream<Uint8Array> | null;
    const reader = body?.getReader();
    assertNonNullable(reader);
    const first = await reader.read();
    await reader.cancel();
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the reader had the first chunk, and the rest went nowhere.
    assertIdentical(new TextDecoder().decode(first.value), "first");
  });
});
