import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  DescribeUserPoolClientCommand,
  ListUserPoolsCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const accountId = "111111111111";
const regionName = "eu-west-2";

interface SimCognitoWithRole {
  readonly simAws: SimAws;
  readonly caller: SimAwsCaller;
  readonly userPoolId: string;
}

/**
 * A pool, and a Role whose only permissions are the statement given.
 */
async function simCognitoWithRole(
  policyStatement: object,
): Promise<SimCognitoWithRole> {
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });

  const created = await simAws
    .cognitoIdentityProvider()
    .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));

  assertNonNullable(created.UserPool?.Id);

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "PoolReader",
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
      RoleName: "PoolReader",
      PolicyName: "PoolPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: policyStatement,
      }),
    }),
  );

  return {
    simAws,
    caller: { kind: "arn", arn: role.Role.Arn },
    userPoolId: created.UserPool.Id,
  };
}

function userPoolArn(userPoolId: string): string {
  return `arn:aws:cognito-idp:${regionName}:${accountId}:userpool/${userPoolId}`;
}

describe("sim Cognito IAM authorization", () => {
  it("allows an operation the caller's policy permits on the pool", async () => {
    // Given a Role allowed to describe one pool by its ARN.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:DescribeUserPool",
      Resource: "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/*",
    });

    // When that Role describes the pool.
    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
        {
          caller,
        },
      );

    // Then the request is allowed.
    assertIdentical(described.UserPool?.Arn, userPoolArn(userPoolId));
  });

  it("denies an operation on a pool the caller's policy does not name", async () => {
    // Given a Role allowed to describe a different pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:DescribeUserPool",
      Resource: userPoolArn("eu-west-2_zZzZzZzZz"),
    });

    // When that Role describes this one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .cognitoIdentityProvider()
        .describeUserPool(
          new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
          { caller },
        );
    });

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("authorizes an app client operation against the pool's ARN", async () => {
    // Given a Role allowed to create app clients in one pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:*",
      Resource: userPoolArn("eu-west-2_zZzZzZzZz"),
    });

    // When that Role creates an app client in another pool.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().createUserPoolClient(
        new CreateUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientName: "web",
        }),
        { caller },
      );
    });

    // Then it is denied, because an app client has no ARN of its own and is
    // reached through its pool's.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("reaches every app client in a pool the policy allows", async () => {
    // Given a Role allowed everything on one pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:*",
      Resource: userPoolArn("*"),
    });
    const cognito = simAws.cognitoIdentityProvider();
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
      { caller },
    );

    // When that Role describes the client it made.
    const described = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: created.UserPoolClient?.ClientId,
      }),
      { caller },
    );

    // Then it is allowed.
    assertIdentical(described.UserPoolClient?.ClientName, "web");
  });

  it("authorizes updating an app client against the pool's ARN", async () => {
    // Given a Role allowed to describe and create app clients in a pool, but
    // not to update one.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: [
        "cognito-idp:CreateUserPoolClient",
        "cognito-idp:DescribeUserPoolClient",
      ],
      Resource: userPoolArn("*"),
    });
    const cognito = simAws.cognitoIdentityProvider();
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
      { caller },
    );

    // When that Role updates the client it made.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPoolClient(
        new UpdateUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: created.UserPoolClient?.ClientId,
          ClientName: "web-app",
        }),
        { caller },
      );
    });

    // Then it is denied, because the policy grants no
    // cognito-idp:UpdateUserPoolClient on the pool.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows updating an app client to a policy granting the action", async () => {
    // Given a Role allowed everything on one pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:*",
      Resource: userPoolArn("*"),
    });
    const cognito = simAws.cognitoIdentityProvider();
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
      { caller },
    );

    // When that Role renames the client.
    const updated = await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: created.UserPoolClient?.ClientId,
        ClientName: "web-app",
      }),
      { caller },
    );

    // Then it is allowed.
    assertIdentical(updated.UserPoolClient?.ClientName, "web-app");
  });

  it("denies creating a pool to a policy naming pool ARNs", async () => {
    // Given a Role allowed to create pools, but only on a pool ARN.
    const { simAws, caller } = await simCognitoWithRole({
      Effect: "Allow",
      Action: ["cognito-idp:CreateUserPool", "cognito-idp:ListUserPools"],
      Resource: userPoolArn("*"),
    });

    // When that Role creates a pool and lists pools.
    const poolCreationError = await assertThrowsErrorAsync(async () => {
      await simAws
        .cognitoIdentityProvider()
        .createUserPool(new CreateUserPoolCommand({ PoolName: "another" }), {
          caller,
        });
    });
    const poolListingError = await assertThrowsErrorAsync(async () => {
      await simAws
        .cognitoIdentityProvider()
        .listUserPools(new ListUserPoolsCommand({ MaxResults: 10 }), {
          caller,
        });
    });

    // Then both are denied, because real Cognito gives those two actions no
    // resource-level permissions and they authorize against `*`.
    assertInstanceOf(poolCreationError, SimIamAccessDenied);
    assertInstanceOf(poolListingError, SimIamAccessDenied);
  });

  it("allows creating and listing pools to a policy using a resource of *", async () => {
    // Given a Role allowed those actions on any resource.
    const { simAws, caller } = await simCognitoWithRole({
      Effect: "Allow",
      Action: ["cognito-idp:CreateUserPool", "cognito-idp:ListUserPools"],
      Resource: "*",
    });

    // When that Role creates a pool and lists pools.
    const created = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "another" }), {
        caller,
      });
    const listed = await simAws
      .cognitoIdentityProvider()
      .listUserPools(new ListUserPoolsCommand({ MaxResults: 10 }), { caller });

    // Then both are allowed.
    assertIdentical(created.UserPool?.Name, "another");
    assertIdentical(listed.UserPools?.length, 2);
  });

  it("denies a caller with no permissions before saying whether a pool exists", async () => {
    // Given a Role with no Cognito permissions at all.
    const { simAws, caller } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    });

    // When that Role describes a pool that was never created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .cognitoIdentityProvider()
        .describeUserPool(
          new DescribeUserPoolCommand({ UserPoolId: "eu-west-2_aBcDeFgHi" }),
          { caller },
        );
    });

    // Then it is denied rather than reported missing, as real IAM evaluates
    // the request before the service handles it.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
