import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
  InvokeCommand,
  PublishVersionCommand,
  RemovePermissionCommand,
  UpdateAliasCommand,
} from "@aws-sdk/client-lambda";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambda } from "../../sim-lambda.js";

const accountId = "888888888888";
const callerRoleArn = `arn:aws:iam::${accountId}:role/Caller`;
const functionArn = `arn:aws:lambda:us-east-1:${accountId}:function:orders`;

describe("Simulated Lambda permissions on a version or an alias", () => {
  /**
   * A function with one published version, and an alias pointing at it.
   */
  async function givenPublishedFunction(): Promise<SimLambda> {
    const lambda = new SimAws().lambda();

    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: `arn:aws:iam::${accountId}:role/OrdersRole`,
        Code: { ZipFile: makeLambdaZipFileInput(() => "ordered") },
      }),
    );
    await lambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await lambda.createAlias(
      new CreateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "1",
      }),
    );

    return lambda;
  }

  /**
   * Grant a principal in the function's own Account permission to invoke the
   * resource a qualifier names, which within one Account is enough on its own.
   */
  async function grantInvoke(
    lambda: SimLambda,
    statementId: string,
    qualifier?: string,
  ): Promise<string> {
    const added = await lambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        Qualifier: qualifier,
        StatementId: statementId,
        Action: "lambda:InvokeFunction",
        Principal: callerRoleArn,
      }),
    );

    return added.Statement;
  }

  function statementIds(policy: string): string[] {
    return (
      JSON.parse(policy) as { Statement: { Sid: string }[] }
    ).Statement.map((statement) => statement.Sid);
  }

  it("grants a statement against the ARN of the alias it names", async () => {
    // Given a function with an alias
    const lambda = await givenPublishedFunction();

    // When a permission is granted for that alias
    const statement = await grantInvoke(lambda, "AllowLive", "live");

    // Then the statement it answers with is on the alias, not on the function
    expect(JSON.parse(statement)).toMatchObject({
      Sid: "AllowLive",
      Resource: `${functionArn}:live`,
    });
  });

  it("grants a statement against the ARN of the version it names", async () => {
    // Given a function with a published version
    const lambda = await givenPublishedFunction();

    // When a permission is granted for that version number
    const statement = await grantInvoke(lambda, "AllowVersion", "1");

    // Then the statement carries the version's own qualified ARN
    expect(JSON.parse(statement)).toMatchObject({
      Resource: `${functionArn}:1`,
    });
  });

  it("takes the qualifier appended to the function name", async () => {
    // Given a function with an alias
    const lambda = await givenPublishedFunction();

    // When a permission is granted naming the alias on the function name
    const added = await lambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "orders:live",
        StatementId: "AllowLive",
        Action: "lambda:InvokeFunction",
        Principal: callerRoleArn,
      }),
    );

    // Then it lands on the alias, as a Qualifier of its own would
    expect(JSON.parse(added.Statement)).toMatchObject({
      Resource: `${functionArn}:live`,
    });
  });

  it("reports the statements of the resource the policy was asked for", async () => {
    // Given a function, a version and an alias each granted their own
    // statement
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowFunction");
    await grantInvoke(lambda, "AllowVersion", "1");
    await grantInvoke(lambda, "AllowLive", "live");

    // When each policy is read back
    const read = async (qualifier?: string): Promise<string[]> => {
      const policy = await lambda.getPolicy(
        new GetPolicyCommand({ FunctionName: "orders", Qualifier: qualifier }),
      );

      return statementIds(policy.Policy);
    };

    // Then each resource reports what was granted on it and nothing else
    expect(await read()).toStrictEqual(["AllowFunction"]);
    expect(await read("1")).toStrictEqual(["AllowVersion"]);
    expect(await read("live")).toStrictEqual(["AllowLive"]);
  });

  it("has no policy on an alias nothing was granted on", async () => {
    // Given a function granted a statement of its own
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowFunction");

    // When the alias's policy is read
    // Then the function's grant is not the alias's, so the alias has no policy
    // at all, which is what AWS reports rather than an empty document
    await expect(
      lambda.getPolicy(
        new GetPolicyCommand({ FunctionName: "orders", Qualifier: "live" }),
      ),
    ).rejects.toThrow(SimLambdaResourceNotFoundException);
  });

  it("removes a statement from the resource it was granted on", async () => {
    // Given an alias with one statement granted on it
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowLive", "live");

    // When it is removed for that alias
    await lambda.removePermission(
      new RemovePermissionCommand({
        FunctionName: "orders",
        Qualifier: "live",
        StatementId: "AllowLive",
      }),
    );

    // Then the alias is back to having no policy at all
    await expect(
      lambda.getPolicy(
        new GetPolicyCommand({ FunctionName: "orders", Qualifier: "live" }),
      ),
    ).rejects.toThrow(SimLambdaResourceNotFoundException);
  });

  it("refuses to remove a statement granted on another qualifier", async () => {
    // Given a statement granted on an alias
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowLive", "live");

    // When it is removed from the function itself
    // Then the function's own policy has no such statement, and it is reported
    // as not found rather than reaching the alias
    await expect(
      lambda.removePermission(
        new RemovePermissionCommand({
          FunctionName: "orders",
          StatementId: "AllowLive",
        }),
      ),
    ).rejects.toThrow(/Statement AllowLive is not found/);
  });

  it("admits an invocation through the alias it was granted on", async () => {
    // Given a principal granted the invocation on the alias
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowLive", "live");

    // When they invoke the function through that alias
    const invoked = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "live" }),
      { caller: { kind: "arn", arn: callerRoleArn } },
    );

    // Then the grant on the alias is what admits the call
    expect(invoked.StatusCode).toBe(200);
    expect(invoked.ExecutedVersion).toBe("1");
  });

  it("refuses an alias invocation granted only on the function", async () => {
    // Given a principal granted the invocation on the function itself
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowFunction");

    // When they invoke it through the alias instead
    // Then the grant covers a different resource and nothing admits the call
    await expect(
      lambda.invoke(
        new InvokeCommand({ FunctionName: "orders", Qualifier: "live" }),
        { caller: { kind: "arn", arn: callerRoleArn } },
      ),
    ).rejects.toThrow(SimIamAccessDenied);
  });

  it("refuses an unqualified invocation granted only on the alias", async () => {
    // Given a principal granted the invocation on the alias
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowLive", "live");

    // When they invoke the function itself
    // Then the alias grant says nothing about the function, so the call is
    // denied
    await expect(
      lambda.invoke(new InvokeCommand({ FunctionName: "orders" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      }),
    ).rejects.toThrow(SimIamAccessDenied);
  });

  it("keeps a grant with the alias when it moves to another version", async () => {
    // Given an alias granted an invocation, moved on to a second version
    const lambda = await givenPublishedFunction();
    await grantInvoke(lambda, "AllowLive", "live");
    await lambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await lambda.updateAlias(
      new UpdateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "2",
      }),
    );

    // When the principal invokes through the alias
    const invoked = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders", Qualifier: "live" }),
      { caller: { kind: "arn", arn: callerRoleArn } },
    );

    // Then the grant belongs to the name rather than to the version behind it,
    // which is what makes an alias a stable thing to grant on
    expect(invoked.ExecutedVersion).toBe("2");
  });

  it("fails when the qualifier names no version or alias", async () => {
    // Given a function whose aliases do not include the one named
    const lambda = await givenPublishedFunction();

    // When a permission is granted for it
    // Then there is nothing to hold the statement against
    await expect(
      grantInvoke(lambda, "AllowStaging", "staging"),
    ).rejects.toThrow(SimLambdaResourceNotFoundException);
  });
});
