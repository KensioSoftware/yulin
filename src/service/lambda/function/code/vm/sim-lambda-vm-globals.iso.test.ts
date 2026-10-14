import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { faker } from "@faker-js/faker";
import {
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../make-lambda-code-zip.js";

/**
 * Zip code that reaches for globals the Node.js runtime has and a sandbox
 * built from a short list would not: a stream it pipes text through, the
 * `global` alias older packages use, and an immediate it cancels.
 */
const globalsSource = `
  exports.handler = async (event) => {
    const upperCase = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk.toUpperCase());
      },
    });
    const writer = upperCase.writable.getWriter();
    void writer.write(event.text);
    void writer.close();
    let piped = "";
    for await (const chunk of upperCase.readable) {
      piped += chunk;
    }

    let immediateRan = false;
    const immediate = setImmediate(() => {
      immediateRan = true;
    });
    clearImmediate(immediate);
    await new Promise((resolve) => setImmediate(resolve));

    return {
      piped,
      globalIsGlobalThis: global === globalThis,
      globalTransformStream: typeof globalThis.global.TransformStream,
      immediateRan,
    };
  };
`;

describe("sim Lambda vm code globals", () => {
  it("gives zip function code the Node.js runtime's globals", async () => {
    // Given a function whose code uses streams, `global` and immediates.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "globals",
        Role: "arn:aws:iam::111111111111:role/GlobalsRole",
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(globalsSource) },
      }),
    );
    const text = faker.lorem.words(3);

    // When the function is invoked.
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "globals",
        Payload: JSON.stringify({ text }),
      }),
    );

    // Then each of them works as it does on the runtime, and the immediate
    // the code cleared never ran.
    assertUndefined(output.FunctionError);
    assertNonNullable(output.Payload);
    assertObjectEquals(JSON.parse(Buffer.from(output.Payload).toString()), {
      piped: text.toUpperCase(),
      globalIsGlobalThis: true,
      globalTransformStream: "function",
      immediateRan: false,
    });
  });
});
