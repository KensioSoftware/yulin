import { CreateKeyValueStoreCommand } from "@aws-sdk/client-cloudfront";
import {
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  PutKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

/**
 * A Role in the given Account, granted one policy statement.
 */
async function roleGranted(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  roleName: string,
  statement: object,
): Promise<string> {
  const simIam = simAws.account(accountId).iam();
  const roleCreation = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: roleName,
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

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "KeyValueStoreAccess",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return roleCreation.Role.Arn;
}

describe("CloudFront key value store IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given CloudFront in a known simulated AWS Account
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();

    // When a store is created without an explicit caller
    const created = await simAws
      .account(accountId)
      .cloudFront()
      .keyValueStores()
      .createKeyValueStore(
        new CreateKeyValueStoreCommand({ Name: "redirects" }),
      );

    // Then IAM defaults to Account root and CloudFront creates it
    assertIdentical(
      created.KeyValueStore.ARN,
      `arn:aws:cloudfront::${accountId}:key-value-store/${created.KeyValueStore.Id}`,
    );
  });

  it("allows a Role granted the create action on the store wildcard", async () => {
    // Given a Role allowed to create any key value store, which is what a
    // policy for this action has to say: the ID is not known before creation
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const roleArn = await roleGranted(simAws, accountId, "StoreCreator", {
      Effect: "Allow",
      Action: "cloudfront:CreateKeyValueStore",
      Resource: `arn:aws:cloudfront::${accountId}:key-value-store/*`,
    });

    // When the Role creates a store
    const created = await simAws
      .account(accountId)
      .cloudFront()
      .keyValueStores()
      .createKeyValueStore(
        new CreateKeyValueStoreCommand({ Name: "redirects" }),
        { caller: { kind: "arn", arn: roleArn } },
      );

    // Then IAM permits it
    assertIdentical(created.KeyValueStore.Name, "redirects");
  });

  it("denies a Role with no key value store permission", async () => {
    // Given a Role allowed to create Functions but not stores
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const roleArn = await roleGranted(simAws, accountId, "FunctionCreator", {
      Effect: "Allow",
      Action: "cloudfront:CreateFunction",
      Resource: "*",
    });

    // When the Role tries to create a store
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .account(accountId)
          .cloudFront()
          .keyValueStores()
          .createKeyValueStore(
            new CreateKeyValueStoreCommand({ Name: "redirects" }),
            { caller: { kind: "arn", arn: roleArn } },
          ),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a data API write to a Role granted only reads", async () => {
    // Given a store, and a Role allowed to read it but not write to it
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const created = await simAws
      .account(accountId)
      .cloudFront()
      .keyValueStores()
      .createKeyValueStore(
        new CreateKeyValueStoreCommand({ Name: "redirects" }),
      );
    const roleArn = await roleGranted(simAws, accountId, "StoreReader", {
      Effect: "Allow",
      Action: "cloudfront-keyvaluestore:GetKey",
      Resource: created.KeyValueStore.ARN,
    });

    const data = simAws.account(accountId).cloudFrontKeyValueStore();
    const caller = { kind: "arn", arn: roleArn } as const;

    // A data write carries this API's own ETag, not the CloudFront client's.
    const described = await data.describeKeyValueStore(
      new DescribeKeyValueStoreCommand({ KvsARN: created.KeyValueStore.ARN }),
    );

    // When the Role writes a key
    const error = await assertThrowsErrorAsync(
      async () =>
        await data.putKey(
          new PutKeyCommand({
            KvsARN: created.KeyValueStore.ARN,
            Key: "a",
            Value: "1",
            IfMatch: described.ETag,
          }),
          { caller },
        ),
    );

    // Then the write is refused, while a read of the same store is not
    assertInstanceOf(error, SimIamAccessDenied);

    await simAws
      .account(accountId)
      .cloudFrontKeyValueStore()
      .putKey(
        new PutKeyCommand({
          KvsARN: created.KeyValueStore.ARN,
          Key: "a",
          Value: "1",
          IfMatch: described.ETag,
        }),
      );

    const read = await data.getKey(
      new GetKeyCommand({ KvsARN: created.KeyValueStore.ARN, Key: "a" }),
      { caller },
    );
    assertIdentical(read.Value, "1");
  });
});
