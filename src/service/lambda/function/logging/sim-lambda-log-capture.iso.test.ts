import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  DeleteLogGroupCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../code/make-lambda-code-zip.js";

const logGroupName = "/aws/lambda/orders";

/**
 * A simulated AWS with one zip-code function whose handler writes the lines
 * given, one call per line.
 */
async function simAwsWithLoggingFunction(handlerBody: string): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Handler: "index.handler",
      Code: {
        ZipFile: makeLambdaCodeZip({
          "index.js":
            `exports.handler = async (event, context) => {\n` +
            `${handlerBody}\n};\n`,
        }),
      },
    }),
  );

  await simAws.backgroundTasksComplete();

  return simAws;
}

async function messagesIn(simAws: SimAws): Promise<readonly string[]> {
  const found = await simAws
    .logs()
    .filterLogEvents(new FilterLogEventsCommand({ logGroupName }));

  return found.events?.map((event) => event.message) ?? [];
}

describe("Lambda handler output in CloudWatch Logs", () => {
  it("records what a handler logged into its own log group", async () => {
    // Given a function whose handler logs as it runs.
    const simAws = await simAwsWithLoggingFunction(
      '  console.log("INFO handling order-1");\n' +
        '  console.error("ERROR order has no items");',
    );

    // When it is invoked.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then both lines are in the function's log group, and a test can search
    // for one of them rather than capturing process output.
    assertArrayEquals(await messagesIn(simAws), [
      "INFO handling order-1",
      "ERROR order has no items",
    ]);
  });

  it("records a multi-line write as one event per line", async () => {
    // Given a handler printing an object over several lines.
    const simAws = await simAwsWithLoggingFunction(
      '  console.log(JSON.stringify({ orderId: "order-1" }, null, 2));',
    );

    // When it is invoked.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then each line is its own event, as real CloudWatch Logs records them.
    assertArrayEquals(await messagesIn(simAws), [
      "{",
      '  "orderId": "order-1"',
      "}",
    ]);
  });

  it("records a write that never sent a newline", async () => {
    // Given a handler writing to the stream directly, without ending the line.
    const simAws = await simAwsWithLoggingFunction(
      '  process.stdout.write("no newline here");',
    );

    // When it is invoked.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then the invocation ending is what records it, rather than a line that
    // never comes.
    assertArrayEquals(await messagesIn(simAws), ["no newline here"]);
  });

  it("keeps a line written across two calls together", async () => {
    // Given a handler building one line out of several writes.
    const simAws = await simAwsWithLoggingFunction(
      [
        '  process.stdout.write("one ");',
        String.raw`  process.stdout.write("line\n");`,
      ].join("\n"),
    );

    // When it is invoked.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then it is one event, not one per write.
    assertArrayEquals(await messagesIn(simAws), ["one line"]);
  });

  it("names the stream the way real Lambda names it, and tells the handler", async () => {
    // Given a handler reporting where it thinks it is writing.
    const simAws = await simAwsWithLoggingFunction(
      "  console.log(context.logGroupName);\n" +
        "  console.log(context.logStreamName);",
    );

    // When it is invoked.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then the group is the one it wrote to, and the stream name carries the
    // date and the $LATEST marker real Lambda uses.
    const messages = await messagesIn(simAws);

    assertArrayLength(messages, 2);
    assertIdentical(messages.at(0), logGroupName);
    const logStreamName = messages.at(1);

    assertNonNullable(logStreamName);
    assertTrue(
      /^\d{4}\/\d{2}\/\d{2}\/\[\$LATEST][\da-f]{32}$/.test(logStreamName),
    );
  });

  it("makes the log group again when something deleted it mid-test", async () => {
    // Given a function that has invoked once, and its log group deleted after.
    const simAws = await simAwsWithLoggingFunction('  console.log("ran");');

    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));
    await simAws
      .logs()
      .deleteLogGroup(new DeleteLogGroupCommand({ logGroupName }));

    // When it is invoked again.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then the invocation makes the group again rather than failing over one
    // that has gone, which is what real Lambda does.
    assertArrayEquals(await messagesIn(simAws), ["ran"]);
  });

  it("records a logger that builds its own console over the streams", async () => {
    // Given a handler using the pattern AWS Lambda Powertools' logger uses:
    // its own Console over the runtime's streams rather than the global one.
    const simAws = await simAwsWithLoggingFunction(
      [
        '  const { Console } = require("node:console");',
        "  const own = new Console({",
        "    stdout: process.stdout,",
        "    stderr: process.stderr,",
        "  });",
        '  own.log(JSON.stringify({ level: "ERROR", message: "order failed" }));',
      ].join("\n"),
    );

    // When it is invoked.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then its output is recorded too, because the recording is on the streams
    // rather than on the sandbox console built over them.
    assertArrayEquals(await messagesIn(simAws), [
      '{"level":"ERROR","message":"order failed"}',
    ]);
  });

  it("keeps one stream across invocations of a warm environment", async () => {
    // Given a function invoked twice.
    const simAws = await simAwsWithLoggingFunction('  console.log("ran");');

    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // When its streams are read.
    const group = simAws.logs().findLogGroup(logGroupName);

    // Then both invocations wrote to the one stream the environment opened,
    // rather than each opening one of its own.
    assertNonNullable(group);
    assertArrayLength(group.streams, 1);
    assertArrayEquals(await messagesIn(simAws), ["ran", "ran"]);
    assertStringStartsWith(group.streams.at(0)?.logStreamName ?? "", "20");
  });
});
