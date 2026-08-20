import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DeleteUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  AssociateWebACLCommand,
  DeleteWebACLCommand,
  DisassociateWebACLCommand,
  GetWebACLForResourceCommand,
  ListResourcesForWebACLCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import { SimWafAssociatedItemException } from "./error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";

interface SimWafPoolSetUp {
  readonly userPoolId: string;
  readonly poolArn: string;
  readonly webAclArn: string;
}

/**
 * A user pool and a REGIONAL web ACL in the same scope.
 *
 * The pool is made with the ordinary command, because what an association
 * needs from Cognito is a pool that is really there.
 */
async function poolAndWebAcl(
  simAws: SimAws,
  webAclName = "pool-acl",
): Promise<SimWafPoolSetUp> {
  const cognito = simAws.cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  assertNonNullable(created.UserPool?.Id);

  const webAcl = await createSimWafWebAcl(
    simAws.wafV2(),
    simWafCreateWebAclFactory.make({ Name: webAclName }),
  );

  return {
    userPoolId: created.UserPool.Id,
    poolArn: cognito.userPool(created.UserPool.Id).arn.value,
    webAclArn: webAcl.ARN,
  };
}

describe("SimWafV2 user pool associations", () => {
  it("puts a web ACL in front of a user pool and reads it back", async () => {
    // Given a user pool and a REGIONAL web ACL.
    const simAws = new SimAws();
    const { poolArn, webAclArn } = await poolAndWebAcl(simAws);
    const waf = simAws.wafV2();

    // When the web ACL is associated with the pool by its ARN.
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAclArn,
        ResourceArn: poolArn,
      }),
    );
    const read = await waf.getWebAclForResource(
      new GetWebACLForResourceCommand({ ResourceArn: poolArn }),
    );

    // Then the pool reports the whole web ACL it now carries.
    assertNonNullable(read.WebACL);
    assertIdentical(read.WebACL.Name, "pool-acl");
    assertIdentical(read.WebACL.ARN, webAclArn);
  });

  it("lists the user pools one web ACL protects", async () => {
    // Given one web ACL in front of a user pool.
    const simAws = new SimAws();
    const { poolArn, webAclArn } = await poolAndWebAcl(simAws);
    const waf = simAws.wafV2();

    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAclArn,
        ResourceArn: poolArn,
      }),
    );

    // When the pools it protects are listed, and then the REST API stages.
    const pools = await waf.listResourcesForWebAcl(
      new ListResourcesForWebACLCommand({
        WebACLArn: webAclArn,
        ResourceType: "COGNITO_USER_POOL",
      }),
    );
    const stages = await waf.listResourcesForWebAcl(
      new ListResourcesForWebACLCommand({
        WebACLArn: webAclArn,
        ResourceType: "API_GATEWAY",
      }),
    );

    // Then the pool is listed under its own type and under no other.
    assertArrayEquals(pools.ResourceArns, [poolArn]);
    assertArrayEquals(stages.ResourceArns, []);
  });

  it("takes the web ACL back off a user pool", async () => {
    // Given a web ACL in front of a user pool.
    const simAws = new SimAws();
    const { poolArn, webAclArn } = await poolAndWebAcl(simAws);
    const waf = simAws.wafV2();

    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAclArn,
        ResourceArn: poolArn,
      }),
    );

    // When it is disassociated.
    await waf.disassociateWebAcl(
      new DisassociateWebACLCommand({ ResourceArn: poolArn }),
    );

    // Then the pool carries nothing, and the web ACL can be deleted.
    const read = await waf.getWebAclForResource(
      new GetWebACLForResourceCommand({ ResourceArn: poolArn }),
    );
    assertUndefined(read.WebACL);
  });

  it("refuses to delete a web ACL still in front of a user pool", async () => {
    // Given a web ACL in front of a user pool.
    const simAws = new SimAws();
    const { poolArn, webAclArn } = await poolAndWebAcl(simAws);
    const waf = simAws.wafV2();
    const created = await waf.getWebAclForResource(
      new GetWebACLForResourceCommand({ ResourceArn: poolArn }),
    );
    assertUndefined(created.WebACL);

    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAclArn,
        ResourceArn: poolArn,
      }),
    );
    const webAcl = await waf.getWebAclForResource(
      new GetWebACLForResourceCommand({ ResourceArn: poolArn }),
    );
    assertNonNullable(webAcl.WebACL);

    // When the web ACL is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.deleteWebAcl(
        new DeleteWebACLCommand({
          Name: webAcl.WebACL?.Name,
          Id: webAcl.WebACL?.Id,
          Scope: "REGIONAL",
          LockToken: "any",
        }),
      );
    });

    // Then it is refused, naming the pool still pointing at it.
    assertInstanceOf(error, SimWafAssociatedItemException);
    assertStringIncludes(error.message, poolArn);
  });

  it("lets go of the web ACL when the user pool is deleted", async () => {
    // Given a web ACL in front of a user pool.
    const simAws = new SimAws();
    const { userPoolId, poolArn, webAclArn } = await poolAndWebAcl(simAws);
    const waf = simAws.wafV2();

    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAclArn,
        ResourceArn: poolArn,
      }),
    );

    // When the pool is deleted.
    await simAws
      .cognitoIdentityProvider()
      .deleteUserPool(new DeleteUserPoolCommand({ UserPoolId: userPoolId }));

    // Then the web ACL is in front of nothing at all.
    const listed = await waf.listResourcesForWebAcl(
      new ListResourcesForWebACLCommand({
        WebACLArn: webAclArn,
        ResourceType: "COGNITO_USER_POOL",
      }),
    );
    assertArrayEquals(listed.ResourceArns, []);
  });
});
