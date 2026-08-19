/* oxlint-disable no-console -- printing is what these handlers are here to do. */
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { assertArrayEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

/**
 * Resolve after a real pause, so two invocations can interleave their output.
 */
async function tick(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * A simulated AWS with one function bound to the given in-process handler.
 */
async function simAwsWithBoundFunction(
  functionName: string,
  handler: SimLambdaHandler,
  simAws: SimAws = new SimAws(),
): Promise<SimAws> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/${functionName}Role`,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  await simAws.backgroundTasksComplete();

  return simAws;
}

async function messagesIn(
  simAws: SimAws,
  logGroupName: string,
): Promise<readonly string[]> {
  const found = await simAws
    .logs()
    .filterLogEvents(new FilterLogEventsCommand({ logGroupName }));

  return found.events?.map((event) => event.message) ?? [];
}

describe("bound Lambda handler output in CloudWatch Logs", () => {
  it("records what a bound handler printed into its own log group", async () => {
    // Given a function bound to an in-process handler that prints as it runs.
    const simAws = await simAwsWithBoundFunction("orders", () => {
      console.log("INFO handling order-1");
      console.error("ERROR order has no items");

      return "done";
    });

    // When it is invoked.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

    // Then both lines are in the function's log group, where a test can
    // search for them as it can for zip code's output.
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/orders"), [
      "INFO handling order-1",
      "ERROR order has no items",
    ]);
  });

  it("records what a bound handler wrote to a standard stream", async () => {
    // Given a handler writing to process.stdout itself, as a logging library
    // building its own console over the stream does.
    const simAws = await simAwsWithBoundFunction("invoices", () => {
      process.stdout.write("INFO invoice-1 sent\n");

      return "done";
    });

    // When it is invoked.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "invoices" }));

    // Then the line reached the function's log group.
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/invoices"), [
      "INFO invoice-1 sent",
    ]);
  });

  it("records a handler bound to a container image repository", async () => {
    // Given an image function whose image stands in for an in-process handler.
    const simAws = new SimAws();
    const imageRepository =
      `${simAws.defaultAccountId}.dkr.ecr.` +
      `${simAws.defaultRegionName}.amazonaws.com/shipments`;

    await simAws.cloudFormation().deployTemplate({
      stackName: "shipments-stack",
      template: {
        Resources: {
          ShipmentsFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "shipments",
              Role: `arn:aws:iam::${simAws.defaultAccountId}:role/ShipmentsRole`,
              PackageType: "Image",
              Code: { ImageUri: `${imageRepository}:build-4172` },
            },
          },
        },
      },
      bindings: [
        {
          imageRepository,
          handler: (): string => {
            console.log("INFO shipment-1 dispatched");

            return "done";
          },
        },
      ],
    });

    // When it is invoked.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "shipments" }));

    // Then its output is in the log group too: an image binding resolves to
    // the same host-scope code as any other handler reference.
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/shipments"), [
      "INFO shipment-1 dispatched",
    ]);
  });

  it("keeps two concurrent invocations in their own log groups", async () => {
    // Given two bound functions printing on either side of a pause.
    const simAws = await simAwsWithBoundFunction("payments", async () => {
      console.log("INFO payment-1 taken");
      await tick(20);
      console.log("INFO payment-1 settled");

      return "done";
    });

    await simAwsWithBoundFunction(
      "refunds",
      async () => {
        await tick(10);
        console.log("INFO refund-1 issued");

        return "done";
      },
      simAws,
    );

    // When both are invoked at once.
    await Promise.all([
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "payments" })),
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "refunds" })),
    ]);

    // Then each function's log group holds only its own output.
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/payments"), [
      "INFO payment-1 taken",
      "INFO payment-1 settled",
    ]);
    assertArrayEquals(await messagesIn(simAws, "/aws/lambda/refunds"), [
      "INFO refund-1 issued",
    ]);
  });
});
