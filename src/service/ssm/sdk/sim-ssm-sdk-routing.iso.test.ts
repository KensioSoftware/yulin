import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  DeleteParameterCommand,
  DeleteParametersCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import { makeLambdaCodeZip } from "../../lambda/function/code/make-lambda-code-zip.js";

const emptyBytes = new Uint8Array();

const readParameterCode =
  'const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");\n' +
  "exports.handler = async () => {\n" +
  "  const client = new SSMClient({});\n" +
  "  const out = await client.send(new GetParameterCommand({\n" +
  '    Name: "/myapp/prod/db-host",\n' +
  "  }));\n" +
  "  return out.Parameter.Value;\n" +
  "};\n";

async function simAwsWithParameterAndRole(
  accountId: SimAwsAccountId,
  policyStatement?: object,
): Promise<SimAws> {
  const simAws = new SimAws({ defaultAccountId: accountId });

  await simAws.ssm().putParameter(
    new PutParameterCommand({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
    }),
  );

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ParameterReaderRole",
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

  if (policyStatement !== undefined) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ParameterReaderRole",
        PolicyName: "ReadParameter",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: policyStatement,
        }),
      }),
    );
  }

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "config-reader",
      Role: role.Role.Arn,
      Handler: "index.handler",
      Code: { ZipFile: makeLambdaCodeZip({ "index.js": readParameterCode }) },
    }),
  );

  await simAws.backgroundTasksComplete();

  return simAws;
}

describe("SSM SDK interception", () => {
  it("routes an intercepted SSMClient to simulated Parameter Store", async () => {
    // Given an intercepted SSM SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(SSMClient);

    const client = new SSMClient({ region: "eu-west-2" });

    // When ordinary SDK code writes a parameter and reads it back.
    await client.send(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );
    const read = await client.send(
      new GetParameterCommand({ Name: "/myapp/prod/db-host" }),
    );

    // Then it works with nothing touching the network, and the ARN names the
    // Region the client was configured for.
    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Value, "db.internal");
    assertStringIncludes(String(read.Parameter.ARN), "arn:aws:ssm:eu-west-2:");
  });

  it("routes every supported Command through the intercepted client", async () => {
    // Given an intercepted SSM SDK client with two parameters.
    using simSdk = new SimSdk();
    simSdk.intercept(SSMClient);

    const client = new SSMClient({ region: "eu-west-2" });
    await client.send(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );
    await client.send(
      new PutParameterCommand({
        Name: "/myapp/prod/db-port",
        Type: "String",
        Value: "5432",
      }),
    );

    // When each of the remaining operations is used.
    const many = await client.send(
      new GetParametersCommand({
        Names: ["/myapp/prod/db-host", "/myapp/prod/db-port"],
      }),
    );
    const byPath = await client.send(
      new GetParametersByPathCommand({ Path: "/myapp/prod" }),
    );
    const described = await client.send(new DescribeParametersCommand({}));
    await client.send(
      new DeleteParameterCommand({ Name: "/myapp/prod/db-port" }),
    );
    const deleted = await client.send(
      new DeleteParametersCommand({ Names: ["/myapp/prod/db-host"] }),
    );

    // Then each one reached simulated Parameter Store.
    assertArrayEquals(
      many.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host", "/myapp/prod/db-port"],
    );
    assertArrayEquals(
      byPath.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host", "/myapp/prod/db-port"],
    );
    assertArrayEquals(
      described.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host", "/myapp/prod/db-port"],
    );
    assertArrayEquals(deleted.DeletedParameters, ["/myapp/prod/db-host"]);
  });

  it("reads a parameter inside a Lambda handler as the execution Role", async () => {
    // Given a function whose code reads its configuration on invocation,
    // running as a Role allowed to read that parameter.
    const accountId = makeSimAwsAccountId();
    const simAws = await simAwsWithParameterAndRole(accountId, {
      Effect: "Allow",
      Action: "ssm:GetParameter",
      // The leading slash of the name is not repeated in the ARN.
      Resource: `arn:aws:ssm:us-east-1:${accountId}:parameter/myapp/prod/db-host`,
    });

    // When the function is invoked.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "config-reader" }));

    // Then the handler's own SDK call reached simulated Parameter Store as the
    // execution Role, and that Role's policy allowed it.
    const payload = Buffer.from(invoked.Payload ?? emptyBytes);

    assertStringIncludes(payload.toString("utf8"), "db.internal");
  });

  it("denies a Lambda handler whose Role may not read the parameter", async () => {
    // Given the same function, running as a Role with no SSM permissions.
    const simAws = await simAwsWithParameterAndRole(makeSimAwsAccountId());

    // When the function is invoked.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "config-reader" }));

    // Then the handler fails the way it would on real AWS, rather than reading
    // the configuration anyway.
    assertIdentical(invoked.FunctionError, "Unhandled");

    const payload = Buffer.from(invoked.Payload ?? emptyBytes);

    assertStringIncludes(payload.toString("utf8"), "not authorized");
  });
});
