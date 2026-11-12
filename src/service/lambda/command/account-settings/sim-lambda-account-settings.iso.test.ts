import {
  CreateFunctionCommand,
  GetAccountSettingsCommand,
  PublishVersionCommand,
  PutFunctionConcurrencyCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";

const zipBytes = makeLambdaCodeZip("exports.handler = async () => null;");

describe("Lambda GetAccountSettings", () => {
  it("reports the functions, their stored code and the unreserved concurrency", async () => {
    // Given two zip functions, one with a published version and one with 300
    // reserved.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    for (const functionName of ["orders", "invoices"]) {
      // oxlint-disable-next-line no-await-in-loop -- created in order
      await lambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: functionName,
          Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: { ZipFile: zipBytes },
        }),
      );
    }
    await simAws.backgroundTasksComplete();
    await lambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await lambda.putFunctionConcurrency(
      new PutFunctionConcurrencyCommand({
        FunctionName: "invoices",
        ReservedConcurrentExecutions: 300,
      }),
    );

    // When the account settings are read.
    const { AccountLimit, AccountUsage } = await lambda.getAccountSettings(
      new GetAccountSettingsCommand({}),
    );

    // Then usage counts both functions and three stored packages, and the
    // reservation comes off the Region's 1000.
    assertIdentical(AccountUsage.FunctionCount, 2);
    assertIdentical(AccountUsage.TotalCodeSize, 3 * zipBytes.byteLength);
    assertIdentical(AccountLimit.ConcurrentExecutions, 1000);
    assertIdentical(AccountLimit.UnreservedConcurrentExecutions, 700);
  });

  it("authorizes lambda:GetAccountSettings", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().getAccountSettings(new GetAccountSettingsCommand({}), {
        caller: { kind: "anonymous" },
      }),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:GetAccountSettings");
  });
});
