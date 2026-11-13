import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertTrue,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { grantPublicFunctionUrl } from "../../../../test/lambda/public-url-fixture.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../function/code/make-lambda-code-zip.js";

/**
 * Function code streaming a greeting in two parts a second apart, behind the
 * prelude of a 201 response with a header and a cookie.
 */
const greetingCode =
  "exports.handler = awslambda.streamifyResponse(async (event, response) => {\n" +
  "  const stream = awslambda.HttpResponseStream.from(response, {\n" +
  "    statusCode: 201,\n" +
  '    headers: { "content-type": "text/plain" },\n' +
  '    cookies: ["visited=yes"],\n' +
  "  });\n" +
  '  stream.write("Hello, ");\n' +
  "  await new Promise((resolve) => setTimeout(resolve, 1000));\n" +
  '  stream.end("streamed");\n' +
  "});\n";

/**
 * A simulation on a stopped clock, with the greeting function behind a public
 * Function URL in the mode given.
 */
async function simAwsWithGreeting(
  invokeMode: "BUFFERED" | "RESPONSE_STREAM",
): Promise<{ simAws: SimAws; url: string }> {
  const simAws = new SimAws();
  simAws.clock().freeze();
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "greeter",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/GreeterRole`,
      Handler: "index.handler",
      Code: { ZipFile: makeLambdaCodeZip(greetingCode) },
    }),
  );
  const { FunctionUrl } = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "greeter",
      AuthType: "NONE",
      InvokeMode: invokeMode,
    }),
  );
  await grantPublicFunctionUrl(simAws.lambda(), "greeter");
  await simAws.backgroundTasksComplete();

  return {
    simAws,
    url: new SimAwsLocalUrl({ input: FunctionUrl }).toString(),
  };
}

describe("a streaming handler", () => {
  it("streams its response to a RESPONSE_STREAM Function URL as it writes", async () => {
    // Given the greeting behind a streaming Function URL.
    const { simAws, url } = await simAwsWithGreeting("RESPONSE_STREAM");

    // When the URL is requested, and the first part is read before the
    // second second of the handler's wait has passed.
    const response = await new SimAwsHttp({ simAws }).fetch(url);
    const body = response.body as ReadableStream<Uint8Array> | null;
    const reader = body?.getReader();
    assertNonNullable(reader);
    const first = await reader.read();
    await simAws.clock().advanceBy({ seconds: 1 });
    const second = await reader.read();
    const after = await reader.read();

    // Then the prelude set the status, header and cookie, and the first part
    // arrived before the handler had finished.
    assertResponseStatus(response, 201, await describeResponse(response));
    assertIdentical(response.headers.get("content-type"), "text/plain");
    assertIdentical(response.headers.get("set-cookie"), "visited=yes");
    const decoder = new TextDecoder();
    assertIdentical(decoder.decode(first.value), "Hello, ");
    assertIdentical(decoder.decode(second.value), "streamed");
    assertTrue(after.done);
  });

  it("answers a BUFFERED Function URL once the stream has ended", async () => {
    // Given the greeting behind a buffered Function URL.
    const { simAws, url } = await simAwsWithGreeting("BUFFERED");

    // When the URL is requested, and the handler's wait passes.
    const responding = new SimAwsHttp({ simAws }).fetch(url);
    await simAws.clock().advanceBy({ seconds: 1 });
    const response = await responding;

    // Then the whole greeting came back behind the prelude's status.
    assertResponseStatus(response, 201, await describeResponse(response));
    assertIdentical(await response.text(), "Hello, streamed");
  });

  it("answers a buffered Invoke with the bytes it streamed", async () => {
    // Given the greeting function.
    const { simAws } = await simAwsWithGreeting("BUFFERED");

    // When it is invoked, and the handler's wait passes.
    const invoking = simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter" }));
    await simAws.clock().advanceBy({ seconds: 1 });
    const output = await invoking;

    // Then the payload is the prelude and the body, as written.
    assertNonNullable(output.Payload);
    const payload = Buffer.from(output.Payload);
    const preludeEnd = payload.indexOf(Buffer.alloc(8));
    assertIdentical(
      payload.subarray(preludeEnd + 8).toString(),
      "Hello, streamed",
    );
  });
});
