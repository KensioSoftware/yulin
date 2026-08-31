import {
  CreateFunctionCommand,
  ListFunctionsCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringEndsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

async function createFunction(
  simLambda: SimLambda,
  functionName: string,
): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => functionName) },
    }),
  );
}

describe("Lambda ListFunctionsCommand", () => {
  it("lists nothing when no function has been created", async () => {
    const simLambda = new SimLambda();

    const listed = await simLambda.listFunctions(new ListFunctionsCommand({}));

    assertArrayEmpty(listed.Functions);
  });

  it("lists every function created in the Account and Region", async () => {
    // Given three functions.
    const simLambda = new SimLambda();
    await createFunction(simLambda, "orders");
    await createFunction(simLambda, "invoices");
    await createFunction(simLambda, "shipments");

    // When the functions are listed.
    const listed = await simLambda.listFunctions(new ListFunctionsCommand({}));

    // Then each one is reported, in the order they were created.
    assertArrayEquals(
      listed.Functions.map((simFunction) => simFunction.FunctionName),
      ["orders", "invoices", "shipments"],
    );
  });

  it("reports each function as GetFunction reports it", async () => {
    // Given a function described at creation.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Description: "Takes orders",
        MemorySize: 512,
        Timeout: 30,
      }),
    );

    // When the functions are listed.
    const listed = await simLambda.listFunctions(new ListFunctionsCommand({}));

    // Then the listing carries the whole configuration.
    const [orders] = listed.Functions;
    assertNonNullable(orders);
    assertIdentical(orders.FunctionName, "orders");
    assertStringEndsWith(orders.FunctionArn, ":function:orders");
    assertIdentical(orders.Version, "$LATEST");
    assertIdentical(orders.Handler, "index.handler");
    assertIdentical(orders.Runtime, "nodejs22.x");
    assertIdentical(orders.Description, "Takes orders");
    assertIdentical(orders.MemorySize, 512);
    assertIdentical(orders.Timeout, 30);
  });

  it("lists the functions themselves without a FunctionVersion", async () => {
    // Given a function with two published versions.
    const simLambda = new SimLambda();
    await createFunction(simLambda, "orders");
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // When the functions are listed.
    const listed = await simLambda.listFunctions(new ListFunctionsCommand({}));

    // Then only $LATEST is reported.
    assertArrayEquals(
      listed.Functions.map((simFunction) => simFunction.Version),
      ["$LATEST"],
    );
  });

  it("adds published versions for a FunctionVersion of ALL", async () => {
    // Given a function with two published versions.
    const simLambda = new SimLambda();
    await createFunction(simLambda, "orders");
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // When every version is asked for.
    const listed = await simLambda.listFunctions(
      new ListFunctionsCommand({ FunctionVersion: "ALL" }),
    );

    // Then each version joins the function itself.
    assertArrayEquals(
      listed.Functions.map((simFunction) => simFunction.Version),
      ["$LATEST", "1", "2"],
    );
  });

  it("denies a caller without lambda:ListFunctions", async () => {
    // Given a Role with no Lambda permissions, and a function to list.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    await createFunction(simAws.lambda(), "orders");

    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoPermissionsRole",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When that Role lists the functions.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().listFunctions(new ListFunctionsCommand({}), {
        caller: { kind: "arn", arn: roleCreation.Role.Arn },
      }),
    );

    // Then the whole listing is denied rather than filtered.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:ListFunctions");

    await simAws.backgroundTasksComplete();
  });
});
