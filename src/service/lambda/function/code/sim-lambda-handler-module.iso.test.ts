import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "./lambda-zip-file-input.js";
import {
  lambdaHandlerModule,
  type SimLambdaHandlerModule,
} from "./sim-lambda-handler-module.js";

const roleArn = "arn:aws:iam::111111111111:role/OrdersRole";

const loadedInstant = new Date("2026-03-01T09:00:00.000Z");

interface InvokeResult {
  readonly payload: unknown;
  readonly functionError?: string | undefined;
}

/**
 * Exports held in memory, answered after the turn of the event loop an import
 * takes.
 */
async function moduleOf(exports: () => object): Promise<object> {
  await Promise.resolve();
  return exports();
}

async function createFunction(
  simAws: SimAws,
  module: SimLambdaHandlerModule,
  variables: Record<string, string> = {},
): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(module) },
      Environment: { Variables: variables },
    }),
  );
}

async function invokeOrders(simAws: SimAws): Promise<InvokeResult> {
  const output = await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: "orders", Payload: "{}" }));
  assertNonNullable(output.Payload);

  return {
    payload: JSON.parse(Buffer.from(output.Payload).toString()) as unknown,
    functionError: output.FunctionError,
  };
}

describe("a handler module imported at cold start", () => {
  it("reads the function's variables and time at module scope", async () => {
    // Given a function backed by a module that reads a variable and the time
    // at module scope, on a simulation stopped at a known instant.
    const simAws = new SimAws({ clock: new SimFixedClock(loadedInstant) });
    await createFunction(
      simAws,
      lambdaHandlerModule(
        async () =>
          await import("../../../../../test/lambda/module/orders-handler.js"),
      ),
      { ORDERS_TABLE: "orders-table" },
    );

    // When it is invoked.
    const result = await invokeOrders(simAws);

    // Then module scope saw the function's own variable and simulated time.
    assertIdentical(
      JSON.stringify(result.payload),
      JSON.stringify({
        tableName: "orders-table",
        loadedAt: loadedInstant.getTime(),
      }),
    );
  });

  it("runs the export it names", async () => {
    // Given a function backed by a module's named export.
    const simAws = new SimAws();
    await createFunction(
      simAws,
      lambdaHandlerModule(
        async () =>
          await import("../../../../../test/lambda/module/orders-handler.js"),
        "onOrder",
      ),
    );

    // When it is invoked.
    const result = await invokeOrders(simAws);

    // Then that export answered.
    assertTypeString(result.payload);
  });

  it("imports the module once, keeping it warm", async () => {
    // Given a function backed by a module counting its imports.
    let imports = 0;
    const simAws = new SimAws();
    await createFunction(
      simAws,
      lambdaHandlerModule(
        async () =>
          await moduleOf(() => {
            imports += 1;
            return { handler: () => imports };
          }),
      ),
    );

    // When it is invoked twice.
    await invokeOrders(simAws);
    const second = await invokeOrders(simAws);

    // Then the second invocation found it warm.
    assertIdentical(second.payload, 1);
  });

  it("reports a module that fails to import, and tries again", async () => {
    // Given a module whose first import fails.
    let attempts = 0;
    const simAws = new SimAws();
    await createFunction(
      simAws,
      lambdaHandlerModule(
        async () =>
          await moduleOf(() => {
            attempts += 1;
            if (attempts === 1) {
              throw new Error("Cannot find package 'orders-db'");
            }
            return { handler: () => "recovered" };
          }),
      ),
    );

    // When it is invoked twice.
    const first = await invokeOrders(simAws);
    const second = await invokeOrders(simAws);

    // Then the first reports the import error and the second cold starts.
    assertIdentical(first.functionError, "Unhandled");
    assertIdentical(
      (first.payload as { errorType: string }).errorType,
      "Runtime.ImportModuleError",
    );
    assertIdentical(second.payload, "recovered");
  });

  it("reports an export the module lacks", async () => {
    // Given a module with no export of the name given.
    const simAws = new SimAws();
    await createFunction(
      simAws,
      lambdaHandlerModule(
        async () => await moduleOf(() => ({ handler: () => "orders" })),
        "onRefund",
      ),
    );

    // When it is invoked.
    const result = await invokeOrders(simAws);

    // Then it is reported as Lambda reports a missing handler.
    assertIdentical(
      (result.payload as { errorType: string }).errorType,
      "Runtime.HandlerNotFound",
    );
  });

  it("backs a template function bound to it", async () => {
    // Given a template function bound to a module that reads a variable while
    // it is imported.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "orders",
              Role: roleArn,
              Environment: { Variables: { ORDERS_TABLE: "stack-orders" } },
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "OrdersFunction",
          handler: lambdaHandlerModule(
            async () =>
              await moduleOf(() => {
                const tableName = process.env["ORDERS_TABLE"];
                return { handler: () => tableName };
              }),
          ),
        },
      ],
    });

    // When it is invoked.
    const result = await invokeOrders(simAws);

    // Then the import saw the template's variable.
    assertIdentical(result.payload, "stack-orders");
  });
});
