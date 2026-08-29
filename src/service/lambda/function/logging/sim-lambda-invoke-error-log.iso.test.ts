/* oxlint-disable no-console -- printing is what these handlers are here to do. */
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertArrayMinLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaFunction } from "../sim-lambda-function.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

const ERROR_LINE_PREFIX = "ERROR Invoke Error ";

/**
 * Resolve after a real pause. A handler can then fail after awaiting work.
 */
async function tick(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * A simulated AWS with one stack function backed by an in-process handler,
 * which is what a `bindings` entry gives a template function.
 */
async function simAwsWithBoundFunction(
  functionName: string,
  handler: SimLambdaHandler,
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.cloudFormation().deployTemplate({
    stackName: `${functionName}-stack`,
    template: {
      Resources: {
        HandlerFunction: {
          Type: "AWS::Lambda::Function",
          Properties: {
            FunctionName: functionName,
            Role: `arn:aws:iam::${simAws.defaultAccountId}:role/${functionName}Role`,
          },
        },
      },
    },
    bindings: [{ logicalId: "HandlerFunction", handler }],
  });

  return simAws;
}

/**
 * A simulated AWS with one stack function running the given inline template
 * source, which is what a `Code.ZipFile` property gives a template function.
 */
async function simAwsWithPackagedFunction(
  functionName: string,
  source: string,
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.cloudFormation().deployTemplate({
    stackName: `${functionName}-stack`,
    template: {
      Resources: {
        HandlerFunction: {
          Type: "AWS::Lambda::Function",
          Properties: {
            FunctionName: functionName,
            Role: `arn:aws:iam::${simAws.defaultAccountId}:role/${functionName}Role`,
            Handler: "index.handler",
            Runtime: "nodejs22.x",
            Code: { ZipFile: source },
          },
        },
      },
    },
  });

  return simAws;
}

async function invokeAndReadLog(
  simAws: SimAws,
  functionName: string,
): Promise<readonly string[]> {
  await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: functionName }));

  const found = await simAws.logs().filterLogEvents(
    new FilterLogEventsCommand({
      logGroupName: `/aws/lambda/${functionName}`,
    }),
  );

  return found.events?.map((event) => event.message) ?? [];
}

/**
 * How the recorded line describes the error that ended an invocation.
 */
interface RecordedInvokeError {
  readonly errorType: string;
  readonly errorMessage: string;
  readonly stack: readonly string[];
}

/**
 * The error document out of the one `Invoke Error` line in what was recorded.
 */
function invokeErrorIn(messages: readonly string[]): RecordedInvokeError {
  const errorLines = messages.filter((message) =>
    message.startsWith(ERROR_LINE_PREFIX),
  );

  assertArrayLength(errorLines, 1);
  const errorLine = errorLines.at(0);

  assertNonNullable(errorLine);

  return JSON.parse(
    errorLine.slice(ERROR_LINE_PREFIX.length),
  ) as RecordedInvokeError;
}

describe("an unhandled Lambda error in CloudWatch Logs", () => {
  it("records the error a bound handler threw", async () => {
    // Given a function bound to an in-process handler that logs a line and
    // then fails.
    const simAws = await simAwsWithBoundFunction("orders", () => {
      console.log("INFO handling order-1");

      throw new Error("order has no items");
    });

    // When it is invoked.
    const messages = await invokeAndReadLog(simAws, "orders");

    // Then the log group holds what it logged before the throw, and the error
    // that ended the invocation after it.
    assertArrayLength(messages, 2);
    assertIdentical(messages.at(0), "INFO handling order-1");
    const recorded = invokeErrorIn(messages);

    assertIdentical(recorded.errorType, "Error");
    assertIdentical(recorded.errorMessage, "order has no items");
  });

  it("records the error a packaged handler threw", async () => {
    // Given a function running inline template code that logs a line and then
    // fails. Template code runs in the vm sandbox, in a realm of its own.
    const simAws = await simAwsWithPackagedFunction(
      "invoices",
      "exports.handler = async () => {\n" +
        '  console.log("INFO handling invoice-1");\n' +
        '  throw new Error("invoice has no lines");\n' +
        "};\n",
    );

    // When it is invoked.
    const messages = await invokeAndReadLog(simAws, "invoices");

    // Then the sandboxed throw is recorded the same way. A test reading the
    // log group is told as much on either path.
    assertArrayLength(messages, 2);
    assertIdentical(messages.at(0), "INFO handling invoice-1");
    assertIdentical(
      invokeErrorIn(messages).errorMessage,
      "invoice has no lines",
    );
  });

  it("carries the stack the handler failed on", async () => {
    // Given a handler failing inside a function of its own.
    const simAws = await simAwsWithBoundFunction("payments", async () => {
      const takePayment = (): never => {
        throw new Error("card declined");
      };

      await tick(1);

      return takePayment();
    });

    // When it is invoked.
    const messages = await invokeAndReadLog(simAws, "payments");

    // Then the frames are there to read, one array element each. The line says
    // where the failure came from as well as what it said.
    const { stack } = invokeErrorIn(messages);

    assertArrayMinLength(stack, 2);
    assertStringIncludes(stack.at(0) ?? "", "card declined");
    assertStringIncludes(stack.at(1) ?? "", "takePayment");
  });

  it("records nothing extra when a handler returns", async () => {
    // Given a handler that logs and returns.
    const simAws = await simAwsWithBoundFunction("refunds", () => {
      console.log("INFO refund-1 issued");

      return "done";
    });

    // When it is invoked.
    const messages = await invokeAndReadLog(simAws, "refunds");

    // Then the log group holds what it printed and no error at all.
    assertArrayEquals(messages, ["INFO refund-1 issued"]);
  });

  it("keeps a line the handler never closed out of the error", async () => {
    // Given a handler that fails part way through writing a line.
    const simAws = await simAwsWithBoundFunction("shipments", () => {
      process.stdout.write("INFO shipment-1 ");

      throw new Error("no address");
    });

    // When it is invoked.
    const messages = await invokeAndReadLog(simAws, "shipments");

    // Then the half-written line is an event of its own. Appended to the error
    // line it would hide the error from a filter matching it.
    assertArrayLength(messages, 2);
    assertIdentical(messages.at(0), "INFO shipment-1 ");
    assertIdentical(invokeErrorIn(messages).errorMessage, "no address");
  });

  it("still reports the error to whoever invoked a function with no logs", async () => {
    // Given a function built on its own, outside a SimAws instance, so there
    // is no simulated CloudWatch Logs for it to record to.
    const simFunction = new SimLambdaFunction({
      name: "standalone",
      roleArn: "arn:aws:iam::111111111111:role/StandaloneRole",
      handlerFunction: () => {
        throw new Error("nothing to record it");
      },
    });

    // When it is invoked, then the error still reaches the caller. Recording
    // it is the only part that is skipped.
    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertStringIncludes(error.message, "nothing to record it");
  });
});
