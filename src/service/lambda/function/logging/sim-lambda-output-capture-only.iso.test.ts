import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambda } from "../../sim-lambda.js";
import { makeLambdaCodeZip } from "../code/make-lambda-code-zip.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

/**
 * A handler writing to standard output directly, as AWS Lambda Powertools'
 * metrics does to emit an Embedded Metric Format document.
 */
const emittingSource = String.raw`
  exports.handler = async (event) => {
    process.stdout.write(JSON.stringify(event) + "\n");
    return null;
  };
`;

/**
 * Capture what reaches the host's standard output, which is the console a test
 * run prints to.
 */
function captureHostStdout(): string[] {
  const written: string[] = [];

  vi.spyOn(process.stdout, "write").mockImplementation((chunk): boolean => {
    written.push(String(chunk));
    return true;
  });

  return written;
}

/**
 * A simulated AWS holding one function of the given code.
 */
async function simAwsWithFunction(
  functionName: string,
  code: { readonly ZipFile: Uint8Array },
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/${functionName}Role`,
      Handler: "index.handler",
      Code: code,
    }),
  );

  await simAws.backgroundTasksComplete();

  return simAws;
}

async function messagesIn(
  simAws: SimAws,
  logGroupName: string,
): Promise<readonly string[]> {
  const { events } = await simAws
    .logs()
    .filterLogEvents(new FilterLogEventsCommand({ logGroupName }));

  return events?.map((event) => event.message) ?? [];
}

describe("a simulated Lambda capturing function output only", () => {
  it("keeps what zip code prints out of the test run's console", async () => {
    // Given a function whose handler writes a metric document on every
    // invocation, and a simulated Lambda told to capture only.
    const simAws = await simAwsWithFunction("user", {
      ZipFile: makeLambdaCodeZip(emittingSource),
    });

    simAws.lambda().output().captureOnly();

    const printed = captureHostStdout();

    // When it is invoked.
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "user",
        Payload: JSON.stringify({ UserRequest: 1 }),
      }),
    );

    // Then the host console was left alone, and the line is in the function's
    // log group where a test can still read it.
    assertArrayEmpty(printed);
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/user"), [
      '{"UserRequest":1}',
    ]);
  });

  it("prints as well as records until it is told otherwise", async () => {
    // Given the same function under the settings a simulated Lambda starts
    // with.
    const simAws = await simAwsWithFunction("orders", {
      ZipFile: makeLambdaCodeZip(emittingSource),
    });
    const printed = captureHostStdout();

    // When it is invoked.
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "orders",
        Payload: JSON.stringify({ OrderPlaced: 1 }),
      }),
    );

    // Then the line reached both, which is what makes a failing test readable.
    assertStringIncludes(printed.join(""), '{"OrderPlaced":1}');
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/orders"), [
      '{"OrderPlaced":1}',
    ]);
  });

  it("records what a bound handler prints while printing none of it", async () => {
    // Given a function bound to an in-process handler, which prints through
    // the host process globals rather than through a sandbox of its own.
    const handler: SimLambdaHandler = () => {
      // oxlint-disable-next-line no-console -- printing is what this handler is here to do.
      console.log("INFO handling invoice-1");

      return "done";
    };
    const simAws = await simAwsWithFunction("invoices", {
      ZipFile: makeLambdaZipFileInput(handler),
    });

    simAws.lambda().output().captureOnly();

    const printed = captureHostStdout();

    // When it is invoked.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "invoices" }));

    // Then the line is in the log group and nowhere else. Both paths a
    // function prints through follow the same settings.
    assertArrayEmpty(printed);
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/invoices"), [
      "INFO handling invoice-1",
    ]);
  });

  it("follows a change made after a function has cold started", async () => {
    // Given a function that has already been invoked once, so its execution
    // environment is warm and its sandbox is built.
    const simAws = await simAwsWithFunction("payments", {
      ZipFile: makeLambdaCodeZip(emittingSource),
    });
    const printed = captureHostStdout();
    const invoke = async (attempt: number): Promise<void> => {
      await simAws.lambda().invoke(
        new InvokeCommand({
          FunctionName: "payments",
          Payload: JSON.stringify({ attempt }),
        }),
      );
    };

    await invoke(1);

    // When the simulated Lambda is told to capture only, and it is invoked
    // again.
    simAws.lambda().output().captureOnly();
    await invoke(2);

    // Then only the first invocation printed, and the log group holds both.
    assertArrayEquals(printed, ['{"attempt":1}\n']);
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/payments"), [
      '{"attempt":1}',
      '{"attempt":2}',
    ]);
  });

  it("goes on printing where there is no log group to read back from", async () => {
    // Given a standalone simulated Lambda, which has no simulated CloudWatch
    // Logs beside it, told to capture only.
    const simLambda = new SimLambda();

    simLambda.output().captureOnly();

    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "standalone",
        Role: "arn:aws:iam::123456789012:role/StandaloneRole",
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(emittingSource) },
      }),
    );

    const printed = captureHostStdout();

    // When it is invoked.
    await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "standalone",
        Payload: JSON.stringify({ standalone: true }),
      }),
    );

    // Then the line still reached the host console. Nothing recorded it, and
    // silencing it would have lost it altogether.
    assertStringIncludes(printed.join(""), '{"standalone":true}');
  });
});
