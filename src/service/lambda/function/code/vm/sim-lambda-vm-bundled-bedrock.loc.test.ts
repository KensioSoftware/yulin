import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { bundleHandler } from "../../../../../../test/lambda/bundled-handler.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../make-lambda-code-zip.js";

/**
 * A handler that builds a Bedrock Runtime client at module scope, which
 * reaches for the WHATWG streams as the bundle loads.
 */
const bedrockClientHandlerSource = `
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

export const handler = async () => bedrock.config.serviceId;
`;

describe("sim Lambda vm code with a bundled Bedrock Runtime client", () => {
  it("loads a handler that bundles Bedrock Runtime", async () => {
    // Given a function whose deployment package bundles a Bedrock Runtime
    // client.
    const simAws = new SimAws();
    const zipFile = makeLambdaCodeZip(
      await bundleHandler(bedrockClientHandlerSource),
    );
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "bedrock-client",
        Role: "arn:aws:iam::111111111111:role/BedrockClientRole",
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "bedrock-client" }));

    // Then the bundle loaded and the handler ran.
    assertUndefined(output.FunctionError);
    assertNonNullable(output.Payload);
    assertIdentical(
      Buffer.from(output.Payload).toString(),
      '"Bedrock Runtime"',
    );

    await simAws.backgroundTasksComplete();
  });
});
