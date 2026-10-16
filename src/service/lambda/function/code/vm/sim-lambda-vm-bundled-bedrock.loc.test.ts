import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { bundleHandler } from "../../../../../../test/lambda/bundled-handler.js";
import { executionRoleArn } from "../../../../../../test/lambda/execution-role.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
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

/**
 * A handler holding a conversation and reading it back as a stream, through
 * a Bedrock Runtime client it bundles, which sends over HTTP/2.
 */
const conversingHandlerSource = `
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

const request = {
  modelId: "qwen.qwen3-32b-v1:0",
  messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
} as const;

export const handler = async () => {
  const conversed = await bedrock.send(new ConverseCommand(request));
  const streamed = await bedrock.send(new ConverseStreamCommand(request));

  let text = "";
  for await (const event of streamed.stream ?? []) {
    text += event.contentBlockDelta?.delta?.text ?? "";
  }

  return [conversed.output?.message?.content?.[0]?.text, text];
};
`;

/**
 * A handler sending a conversation with no messages, which Bedrock rejects as
 * invalid, and reporting how the SDK saw the rejection.
 */
const rejectedConverseHandlerSource = `
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

export const handler = async () => {
  try {
    await bedrock.send(
      new ConverseCommand({ modelId: "qwen.qwen3-32b-v1:0", messages: [] }),
    );
  } catch (error) {
    return [error.$metadata.httpStatusCode, error.$metadata.attempts];
  }
};
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

  it("answers a bundled Bedrock Runtime client from the simulation", async () => {
    // Given a declared answer, and a function bundling a Bedrock Runtime
    // client whose execution Role may invoke models.
    const simAws = new SimAws();
    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });
    const roleArn = await executionRoleArn(simAws, {
      roleName: "AssistantRole",
      action: "bedrock:InvokeModel",
      resource: "*",
    });
    const zipFile = makeLambdaCodeZip(
      await bundleHandler(conversingHandlerSource),
    );
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "assistant",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "assistant" }));

    // Then both calls were answered by simulated Bedrock.
    assertUndefined(output.FunctionError);
    assertNonNullable(output.Payload);
    assertIdentical(
      Buffer.from(output.Payload).toString(),
      '["Tone sandhi.","Tone sandhi."]',
    );

    await simAws.backgroundTasksComplete();
  });

  it("fails a rejected Bedrock call once under a clock far from the host's", async () => {
    // Given a simulation whose clock is years behind the host's, and a
    // function bundling a Bedrock Runtime client.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2020-01-01T09:00:00.000Z")),
    });
    const roleArn = await executionRoleArn(simAws, {
      roleName: "AssistantRole",
      action: "bedrock:InvokeModel",
      resource: "*",
    });
    const zipFile = makeLambdaCodeZip(
      await bundleHandler(rejectedConverseHandlerSource),
    );
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "assistant",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "assistant" }));

    // Then the call failed with a 400 on its first attempt.
    assertUndefined(output.FunctionError);
    assertNonNullable(output.Payload);
    assertIdentical(Buffer.from(output.Payload).toString(), "[400,1]");

    await simAws.backgroundTasksComplete();
  });
});
