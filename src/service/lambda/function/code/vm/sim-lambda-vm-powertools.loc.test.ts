import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";
import { bundleHandler } from "../../../../../../test/lambda/bundled-handler.js";
import { simLambdaVmZipFunctionFactory } from "../sim-lambda-vm-zip-function.factory.js";

/**
 * A handler using AWS Lambda Powertools the way a deployed one does: the
 * logger and the metrics are constructed at module scope, so a warm container
 * reuses them, and both are bundled into the deployment package rather than
 * provided by the runtime.
 *
 * The logger builds its own console over process.stdout and process.stderr,
 * and the metrics write their EMF document to stdout, so this exercises the
 * real library against the sandbox's standard streams.
 */
const handlerSource = `
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";

const logger = new Logger({ serviceName: "orders" });
const metrics = new Metrics({ namespace: "Orders", serviceName: "orders" });

export const handler = async (event: { orderId: string }) => {
  logger.info("order handled", { orderId: event.orderId });
  metrics.addMetric("OrdersHandled", MetricUnit.Count, 1);
  metrics.publishStoredMetrics();
  return { handled: event.orderId };
};
`;

describe("sim Lambda vm code with AWS Lambda Powertools", () => {
  it("runs a handler whose logger and metrics are Powertools", async () => {
    // Given a function whose deployment package bundles Powertools, as a
    // CDK NodejsFunction build produces.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: await bundleHandler(handlerSource),
    });
    const written = captureHostStdout();

    // When the function is invoked.
    const result = await simFunction.invoke({ orderId: "order-1" });

    // Then the module loaded and the handler ran, rather than the logger's
    // console construction failing the import. The result is cloned because
    // vm result objects belong to the vm realm.
    const returned = structuredClone(result) as Record<string, unknown>;
    assertIdentical(returned["handled"], "order-1");

    // And what the logger logged is where a test can read it.
    const output = written.join("");
    assertStringIncludes(output, '"message":"order handled"');
    assertStringIncludes(output, '"orderId":"order-1"');

    // And so is the EMF document the metrics printed.
    const emf = embeddedMetric(output);
    assertIdentical(emf["OrdersHandled"], 1);
    assertStringIncludes(JSON.stringify(emf["_aws"]), '"Namespace":"Orders"');
  });
});

/**
 * Read the embedded metric format document out of what was printed.
 */
function embeddedMetric(output: string): Record<string, unknown> {
  const line = output
    .split("\n")
    .find((candidate) => candidate.includes('"_aws"'));
  assertNonNullable(line);

  return JSON.parse(line) as Record<string, unknown>;
}

function captureHostStdout(): string[] {
  const written: string[] = [];

  vi.spyOn(process.stdout, "write").mockImplementation((chunk): boolean => {
    written.push(String(chunk));
    return true;
  });

  return written;
}
