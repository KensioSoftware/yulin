import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  DeleteParameterCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

interface SimAwsWithRole {
  readonly simAws: SimAws;
  readonly caller: SimAwsCaller;
}

async function simAwsWithRole(
  policyStatement: object,
): Promise<SimAwsWithRole> {
  const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
  const accountId = simAws.defaultAccountId;

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ParameterReader",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "ParameterReader",
      PolicyName: "ParameterPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: policyStatement,
      }),
    }),
  );

  return { simAws, caller: { kind: "arn", arn: role.Role.Arn } };
}

async function seedDbHost(simAws: SimAws): Promise<void> {
  await simAws.ssm().putParameter(
    new PutParameterCommand({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
    }),
  );
}

describe("SSM IAM authorization", () => {
  it("allows a read the caller's policy permits", async () => {
    // Given a Role allowed to read one parameter by its real ARN.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:GetParameter",
      Resource: `arn:aws:ssm:${new SimAws().defaultRegionName}:${accountIdOneOnes}:parameter/myapp/prod/db-host`,
    });
    await seedDbHost(simAws);

    // When it reads that parameter.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host" }), {
        caller,
      });

    // Then the read succeeds.
    assertIdentical(read.Parameter?.Value, "db.internal");
  });

  it("denies a policy that keeps the name's leading slash in the ARN", async () => {
    // Given a Role whose policy names the parameter the way it is easy to
    // write it: ARN prefix plus the name, slash and all.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:GetParameter",
      Resource: `arn:aws:ssm:${new SimAws().defaultRegionName}:${accountIdOneOnes}:parameter//myapp/prod/db-host`,
    });
    await seedDbHost(simAws);

    // When it reads the parameter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(
          new GetParameterCommand({ Name: "/myapp/prod/db-host" }),
          { caller },
        ),
    );

    // Then it is denied here rather than in a deployment, because the real ARN
    // has one slash after `parameter`, not two.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a write the caller's policy does not permit", async () => {
    // Given a Role allowed only to read.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:GetParameter",
      Resource: "*",
    });

    // When it writes a parameter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/db-host",
          Type: "String",
          Value: "db.internal",
        }),
        { caller },
      ),
    );

    // Then it is denied, against the ARN the parameter would have had.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a delete the caller's policy does not permit", async () => {
    // Given a Role allowed only to read.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:GetParameter",
      Resource: "*",
    });
    await seedDbHost(simAws);

    // When it deletes the parameter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .deleteParameter(
          new DeleteParameterCommand({ Name: "/myapp/prod/db-host" }),
          { caller },
        ),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a batch read where one name is not permitted", async () => {
    // Given a Role allowed to read one parameter of two.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:GetParameters",
      Resource: `arn:aws:ssm:${new SimAws().defaultRegionName}:${accountIdOneOnes}:parameter/myapp/prod/db-host`,
    });
    await seedDbHost(simAws);
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-port",
        Type: "String",
        Value: "5432",
      }),
    );

    // When it reads both in one batch.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParameters(
        new GetParametersCommand({
          Names: ["/myapp/prod/db-host", "/myapp/prod/db-port"],
        }),
        { caller },
      ),
    );

    // Then the whole batch is denied, as it is on real AWS: one unpermitted
    // name fails the request rather than being left out of the results.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a read of a parameter that is not there", async () => {
    // Given a Role with no parameter permissions at all.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    });

    // When it reads a parameter that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(new GetParameterCommand({ Name: "/myapp/missing" }), {
          caller,
        }),
    );

    // Then it is denied rather than told the parameter is missing, because
    // real IAM evaluates the request before the service sees it.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("authorizes a path listing against the path itself", async () => {
    // Given a Role allowed on a path but explicitly denied one parameter
    // under it.
    const regionName = new SimAws().defaultRegionName;
    const parameterArn = `arn:aws:ssm:${regionName}:${accountIdOneOnes}:parameter/myapp/prod/db-host`;
    const { simAws, caller } = await simAwsWithRole([
      {
        Effect: "Allow",
        Action: "ssm:GetParametersByPath",
        Resource: `arn:aws:ssm:${regionName}:${accountIdOneOnes}:parameter/myapp`,
      },
      {
        Effect: "Deny",
        Action: "ssm:GetParametersByPath",
        Resource: parameterArn,
      },
    ]);
    await seedDbHost(simAws);

    // When it lists the path recursively.
    const listed = await simAws.ssm().getParametersByPath(
      new GetParametersByPathCommand({
        Path: "/myapp",
        Recursive: true,
      }),
      { caller },
    );

    // Then the denied parameter still comes back, because access to a path is
    // access to everything under it on real Parameter Store.
    assertArrayEquals(
      listed.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host"],
    );
  });

  it("denies a path listing the caller's policy does not reach", async () => {
    // Given a Role allowed on a different path.
    const regionName = new SimAws().defaultRegionName;
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:GetParametersByPath",
      Resource: `arn:aws:ssm:${regionName}:${accountIdOneOnes}:parameter/other`,
    });
    await seedDbHost(simAws);

    // When it lists a path the policy does not name.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParametersByPath(
          new GetParametersByPathCommand({ Path: "/myapp", Recursive: true }),
          { caller },
        ),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies DescribeParameters to a policy naming parameter ARNs", async () => {
    // Given a Role allowed to describe, but only against parameter ARNs.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:DescribeParameters",
      Resource: `arn:aws:ssm:${new SimAws().defaultRegionName}:${accountIdOneOnes}:parameter/myapp/*`,
    });
    await seedDbHost(simAws);

    // When it describes the parameters.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .describeParameters(new DescribeParametersCommand({}), { caller }),
    );

    // Then it is denied, because real Parameter Store gives this action no
    // resource-level permissions and it has to be allowed on `*`.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows DescribeParameters to a policy allowing it on everything", async () => {
    // Given a Role allowed to describe on `*`.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "ssm:DescribeParameters",
      Resource: "*",
    });
    await seedDbHost(simAws);

    // When it describes the parameters.
    const described = await simAws
      .ssm()
      .describeParameters(new DescribeParametersCommand({}), { caller });

    // Then the listing succeeds.
    assertArrayEquals(
      described.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host"],
    );
  });
});
