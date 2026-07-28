import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  DescribeParametersCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";

describe("SSM DescribeParameters", () => {
  it("lists parameter metadata without values, in name order", async () => {
    // Given two stored parameters.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-port",
        Type: "String",
        Value: "5432",
      }),
    );
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-host",
        Type: "String",
        Value: "db.internal",
        Description: "The database host",
      }),
    );

    // When the parameters are described.
    const described = await simAws
      .ssm()
      .describeParameters(new DescribeParametersCommand({}));

    // Then the metadata comes back in name order, with no values in it.
    assertNonNullable(described.Parameters);
    assertArrayEquals(
      described.Parameters.map((parameter) => parameter.Name),
      ["/myapp/db-host", "/myapp/db-port"],
    );

    const first = described.Parameters.at(0);

    assertNonNullable(first);
    assertIdentical(first.Description, "The database host");
    assertIdentical(first.Type, "String");
    assertIdentical(first.Tier, "Standard");
    assertIdentical(first.Version, 1);
    assertArrayEquals(first.Policies, []);
    assertUndefined(
      (first as { Value?: string }).Value,
      "DescribeParameters reports no value",
    );
  });

  it("records the caller that last wrote each parameter", async () => {
    // Given a Role that writes a parameter.
    const simAws = new SimAws();
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Deployer",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Deployer",
        PolicyName: "WriteParameters",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "ssm:PutParameter",
            Resource: "*",
          },
        }),
      }),
    );

    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-host",
        Type: "String",
        Value: "db.internal",
      }),
      { caller: { kind: "arn", arn: role.Role.Arn } },
    );

    // When the parameters are described.
    const described = await simAws
      .ssm()
      .describeParameters(new DescribeParametersCommand({}));

    // Then the writer is reported, as real Parameter Store reports it.
    assertIdentical(
      described.Parameters?.at(0)?.LastModifiedUser,
      role.Role.Arn,
    );
  });

  it("pages at fifty parameters", async () => {
    // Given fifty-one parameters.
    const simAws = new SimAws();

    await Promise.all(
      Array.from({ length: 51 }, async (_, index) =>
        simAws.ssm().putParameter(
          new PutParameterCommand({
            Name: `/myapp/p${String(index).padStart(2, "0")}`,
            Type: "String",
            Value: "x",
          }),
        ),
      ),
    );

    // When they are described without a MaxResults.
    const first = await simAws
      .ssm()
      .describeParameters(new DescribeParametersCommand({}));

    // Then fifty come back with a token for the rest.
    assertArrayLength(first.Parameters ?? [], 50);

    const second = await simAws
      .ssm()
      .describeParameters(
        new DescribeParametersCommand({ NextToken: first.NextToken }),
      );

    assertArrayLength(second.Parameters ?? [], 1);
    assertUndefined(second.NextToken);
  });

  it("refuses more results per page than Parameter Store returns", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing asks for more than fifty at a time.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .describeParameters(new DescribeParametersCommand({ MaxResults: 51 })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "between 1 and 50");
  });

  it("refuses filters", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing asks to be filtered.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().describeParameters(
        new DescribeParametersCommand({
          ParameterFilters: [{ Key: "Type", Values: ["String"] }],
        }),
      ),
    );

    // Then it is refused rather than listing more than real Parameter Store
    // would.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "Filters");
  });

  it("refuses a request for shared parameters", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing asks for parameters shared from another Account.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .describeParameters(new DescribeParametersCommand({ Shared: true })),
    );

    // Then it is refused, because sharing is not simulated.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "Shared");
  });

  it("describes nothing when a request carries no input at all", async () => {
    // Given a simulated AWS with one parameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-host",
        Type: "String",
        Value: "x",
      }),
    );

    // When a Command is handled that carries no input object.
    const described = await simAws.ssm().describeParameters({});

    // Then the listing still works, as an SDK caller passing {} would expect.
    assertArrayLength(described.Parameters ?? [], 1);
  });
});
