import {
  CreateFunctionCommand,
  GetFunctionConfigurationCommand,
  PublishVersionCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

async function createOrders(simLambda: SimLambda): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      Timeout: 10,
      Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
    }),
  );
}

describe("Lambda GetFunctionConfigurationCommand", () => {
  it("reports the configuration at the top level of the answer", async () => {
    // Given a function.
    const simLambda = new SimLambda();
    await createOrders(simLambda);

    // When its configuration is read.
    const configuration = await simLambda.getFunctionConfiguration(
      new GetFunctionConfigurationCommand({ FunctionName: "orders" }),
    );

    // Then the members GetFunction nests are reported directly.
    assertIdentical(configuration.FunctionName, "orders");
    assertIdentical(configuration.Handler, "index.handler");
    assertIdentical(configuration.Runtime, "nodejs22.x");
    assertIdentical(configuration.Timeout, 10);
    assertIdentical(configuration.Version, "$LATEST");
  });

  it("reports a published version's settings for a Qualifier", async () => {
    // Given a version published before the function's timeout changed.
    const simLambda = new SimLambda();
    await createOrders(simLambda);
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 30,
      }),
    );

    // When the version's configuration is read.
    const configuration = await simLambda.getFunctionConfiguration(
      new GetFunctionConfigurationCommand({
        FunctionName: "orders",
        Qualifier: "1",
      }),
    );

    // Then it keeps what it was published with.
    assertIdentical(configuration.Version, "1");
    assertIdentical(configuration.Timeout, 10);
  });

  it("throws on a function that does not exist", async () => {
    const simLambda = new SimLambda();

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.getFunctionConfiguration(
        new GetFunctionConfigurationCommand({ FunctionName: "missing" }),
      ),
    );

    assertInstanceOf(error, SimLambdaResourceNotFoundException);
  });

  it("authorizes lambda:GetFunctionConfiguration", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .getFunctionConfiguration(
          new GetFunctionConfigurationCommand({ FunctionName: "orders" }),
          { caller: { kind: "anonymous" } },
        ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:GetFunctionConfiguration");
  });
});
