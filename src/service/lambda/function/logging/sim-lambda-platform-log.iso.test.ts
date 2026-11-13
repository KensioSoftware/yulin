import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { assertArrayEquals, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../code/make-lambda-code-zip.js";

/**
 * A simulated AWS on a stopped clock, with one function that prints its
 * request id and then sleeps a second and a half.
 */
async function simAwsWithSleepingFunction(): Promise<SimAws> {
  const simAws = new SimAws();
  simAws.clock().freeze();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Handler: "index.handler",
      MemorySize: 256,
      Code: {
        ZipFile: makeLambdaCodeZip(
          "exports.handler = async (event, context) => {\n" +
            "  console.log(context.awsRequestId);\n" +
            "  await new Promise((resolve) => setTimeout(resolve, 1500));\n" +
            "};\n",
        ),
      },
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

/**
 * Invoke the function, moving the clock past its sleep.
 */
async function invoked(simAws: SimAws): Promise<void> {
  const invocation = simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: "orders" }));
  await simAws.clock().advanceBy({ milliseconds: 1500 });
  await invocation;
}

async function messagesIn(simAws: SimAws): Promise<readonly string[]> {
  const found = await simAws
    .logs()
    .filterLogEvents(
      new FilterLogEventsCommand({ logGroupName: "/aws/lambda/orders" }),
    );

  return found.events?.map((event) => event.message) ?? [];
}

describe("the platform lines of a sim Lambda log stream", () => {
  it("writes START, END and REPORT around each invocation", async () => {
    // Given a function that sleeps a second and a half of simulated time.
    const simAws = await simAwsWithSleepingFunction();

    // When it is invoked twice.
    await invoked(simAws);
    await invoked(simAws);

    // Then each invocation is framed by the lines real Lambda writes, naming
    // the request id the handler was given, and only the cold start reports
    // an init duration.
    const messages = await messagesIn(simAws);
    const [first, second] = [messages[1], messages[5]];
    assertNonNullable(first);
    assertNonNullable(second);
    const report =
      "Duration: 1500.00 ms\tBilled Duration: 1500 ms\t" +
      "Memory Size: 256 MB\tMax Memory Used: 64 MB\t";
    assertArrayEquals(messages, [
      `START RequestId: ${first} Version: $LATEST`,
      first,
      `END RequestId: ${first}`,
      `REPORT RequestId: ${first}\t${report}Init Duration: 0.00 ms\t`,
      `START RequestId: ${second} Version: $LATEST`,
      second,
      `END RequestId: ${second}`,
      `REPORT RequestId: ${second}\t${report}`,
    ]);
  });
});
