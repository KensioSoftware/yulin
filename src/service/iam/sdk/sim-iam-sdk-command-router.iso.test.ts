import { describe, it } from "vitest";
import {
  AttachRolePolicyCommand,
  CreateAccessKeyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  DeleteRoleCommand,
  GetPolicyCommand,
  GetRoleCommand,
  IAMClient,
  ListPoliciesCommand,
  ListRolesCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";

const allowAllPolicyDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
});

describe("simulated IAM SDK Command routing", () => {
  it("round-trips Role Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new IAMClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const roleCreation = await client.send(
      new CreateRoleCommand({
        RoleName: "InterceptRole",
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
    assertNonNullable(roleCreation.Role?.Arn);

    const roleOut = await client.send(
      new GetRoleCommand({ RoleName: "InterceptRole" }),
    );
    assertIdentical(roleOut.Role?.Arn, roleCreation.Role.Arn);

    const rolesOut = await client.send(new ListRolesCommand({}));
    assertIdentical(rolesOut.Roles?.[0]?.RoleName, "InterceptRole");

    await client.send(
      new PutRolePolicyCommand({
        RoleName: "InterceptRole",
        PolicyName: "inline-policy",
        PolicyDocument: allowAllPolicyDocument,
      }),
    );
  });

  it("round-trips managed Policy Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new IAMClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const policyCreation = await client.send(
      new CreatePolicyCommand({
        PolicyName: "InterceptPolicy",
        PolicyDocument: allowAllPolicyDocument,
      }),
    );
    assertNonNullable(policyCreation.Policy?.Arn);

    const policyOut = await client.send(
      new GetPolicyCommand({ PolicyArn: policyCreation.Policy.Arn }),
    );
    assertIdentical(policyOut.Policy?.PolicyName, "InterceptPolicy");

    const policiesOut = await client.send(new ListPoliciesCommand({}));
    assertIdentical(policiesOut.Policies?.[0]?.PolicyName, "InterceptPolicy");

    await client.send(
      new CreateRoleCommand({
        RoleName: "AttachTargetRole",
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
    await client.send(
      new AttachRolePolicyCommand({
        RoleName: "AttachTargetRole",
        PolicyArn: policyCreation.Policy.Arn,
      }),
    );
  });

  it("round-trips User Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new IAMClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const userCreation = await client.send(
      new CreateUserCommand({ UserName: "InterceptUser" }),
    );
    assertNonNullable(userCreation.User?.Arn);

    await client.send(
      new PutUserPolicyCommand({
        UserName: "InterceptUser",
        PolicyName: "inline-user-policy",
        PolicyDocument: allowAllPolicyDocument,
      }),
    );

    const accessKeyCreation = await client.send(
      new CreateAccessKeyCommand({ UserName: "InterceptUser" }),
    );
    assertNonNullable(accessKeyCreation.AccessKey?.AccessKeyId);

    // And the created access key resolves in sim IAM to the User.
    const identity = simSdk.simAws.iam().credentials.resolveCredentials({
      accessKeyId: accessKeyCreation.AccessKey.AccessKeyId,
      secretAccessKey: accessKeyCreation.AccessKey.SecretAccessKey ?? "",
    });
    assertIdentical(identity.principal.kind, "arn");
  });

  it("rejects a Command simulated IAM does not support", async () => {
    using simSdk = new SimSdk();
    const client = new IAMClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new DeleteRoleCommand({ RoleName: "InterceptRole" }));
    });

    assertStringIncludes(error.message, "DeleteRoleCommand");
    assertStringIncludes(error.message, "CreateRoleCommand");
  });
});
