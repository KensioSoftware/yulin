import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  AssociateWebACLCommand,
  GetWebACLForResourceCommand,
  ListResourcesForWebACLCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  DEFAULT_SIM_AWS_ACCOUNT_ID,
  type SimAwsAccountId,
} from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import {
  SimWafInvalidParameterException,
  SimWafUnavailableEntityException,
  SimWafUnsimulatedInputException,
} from "./error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;

/**
 * A user pool and a REGIONAL web ACL in the same scope.
 *
 * Every refusal here is about one of the two ARNs an association carries, so
 * each test starts from a pair that would otherwise be associated.
 */
async function poolAndWebAcl(simAws: SimAws): Promise<{
  readonly poolArn: string;
  readonly webAclArn: string;
}> {
  const cognito = simAws.cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  assertNonNullable(created.UserPool?.Id);

  const webAcl = await createSimWafWebAcl(
    simAws.wafV2(),
    simWafCreateWebAclFactory.make(),
  );

  return {
    poolArn: cognito.userPool(created.UserPool.Id).arn.value,
    webAclArn: webAcl.ARN,
  };
}

describe("SimWafV2 user pool association refusals", () => {
  it("refuses a CLOUDFRONT scope web ACL", async () => {
    // Given a user pool and a CLOUDFRONT scope web ACL.
    const simAws = new SimAws();
    const { poolArn } = await poolAndWebAcl(simAws);
    const webAcl = await createSimWafWebAcl(
      simAws.wafV2(),
      simWafCreateWebAclFactory.make({ Scope: "CLOUDFRONT" }),
    );

    // When it is associated with the pool.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAcl.ARN,
          ResourceArn: poolArn,
        }),
      );
    });

    // Then it is refused. A user pool takes a REGIONAL web ACL, and a
    // CLOUDFRONT one belongs to a distribution.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "CLOUDFRONT");
  });

  it("refuses a user pool in another Region", async () => {
    // Given a web ACL in one Region and a pool in another.
    const simAws = new SimAws();
    const { webAclArn } = await poolAndWebAcl(simAws);
    const elsewhere = simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .cognitoIdentityProvider();
    const created = await elsewhere.createUserPool(
      new CreateUserPoolCommand({ PoolName: "elsewhere-users" }),
    );
    assertNonNullable(created.UserPool?.Id);

    // When the pool from elsewhere is associated with the web ACL.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn: elsewhere.userPool(created.UserPool?.Id ?? "").arn.value,
        }),
      );
    });

    // Then it is refused before anything looks for it.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "eu-west-2");
  });

  it("refuses a user pool in another Account", async () => {
    // Given a web ACL in one Account and a pool in another.
    const simAws = new SimAws();
    const { webAclArn } = await poolAndWebAcl(simAws);
    const elsewhere = simAws
      .accountRegionScope(accountIdTwoTwos, "us-east-1")
      .cognitoIdentityProvider();
    const created = await elsewhere.createUserPool(
      new CreateUserPoolCommand({ PoolName: "elsewhere-users" }),
    );
    assertNonNullable(created.UserPool?.Id);

    // When the other Account's pool is associated with the web ACL.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn: elsewhere.userPool(created.UserPool?.Id ?? "").arn.value,
        }),
      );
    });

    // Then it is refused. A web ACL protects what is in its own Account.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, accountIdTwoTwos);
  });

  it("refuses a user pool that is not there", async () => {
    // Given a web ACL and the ARN of a pool nothing created.
    const simAws = new SimAws();
    const { webAclArn } = await poolAndWebAcl(simAws);
    const missing =
      `arn:aws:cognito-idp:us-east-1:${DEFAULT_SIM_AWS_ACCOUNT_ID}:` +
      `userpool/us-east-1_aBcDeFgHi`;

    // When that pool is associated with the web ACL.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn: missing,
        }),
      );
    });

    // Then WAF reports a resource it could not retrieve.
    assertInstanceOf(error, SimWafUnavailableEntityException);
    assertStringIncludes(error.message, missing);
  });

  it("reports no web ACL for a pool that is not there", async () => {
    // Given a simulation holding one pool.
    const simAws = new SimAws();
    await poolAndWebAcl(simAws);

    // When the web ACL of a pool nothing created is read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().getWebAclForResource(
        new GetWebACLForResourceCommand({
          ResourceArn:
            `arn:aws:cognito-idp:us-east-1:${DEFAULT_SIM_AWS_ACCOUNT_ID}:` +
            `userpool/us-east-1_zZyYxXwWv`,
        }),
      );
    });

    // Then the pool is reported as the thing that is missing.
    assertInstanceOf(error, SimWafUnavailableEntityException);
  });

  it("names both simulated types when a listing names no resource type", async () => {
    // Given a web ACL.
    const simAws = new SimAws();
    const { webAclArn } = await poolAndWebAcl(simAws);

    // When its resources are listed without naming a type.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .wafV2()
        .listResourcesForWebAcl(
          new ListResourcesForWebACLCommand({ WebACLArn: webAclArn }),
        );
    });

    // Then the refusal names the types that can be listed here.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "API_GATEWAY");
    assertStringIncludes(error.message, "COGNITO_USER_POOL");
  });
});
