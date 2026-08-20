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

import { assertDefined } from "../../util/type-guard/defined.js";
import type { SimRestApi } from "../apigateway/api/sim-rest-api.js";
import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import { SimWafAssociatedItemException } from "./error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";

/**
 * A deployed REST API stage for a web ACL to be put in front of.
 *
 * The commands are the ordinary ones, because what the association needs from
 * API Gateway is a stage that is really there.
 */
async function deployedRestApi(
  simAws: SimAws,
  stageName = "prod",
): Promise<SimRestApi> {
  const apiGateway = simAws.apiGateway();
  const created = await apiGateway.createRestApi({ input: { name: "orders" } });

  await apiGateway.createDeployment({
    input: { restApiId: created.id, stageName },
  });

  const restApi = apiGateway.findRestApi(created.id);
  assertDefined(restApi, `Simulated API Gateway lost the API ${created.id}`);

  return restApi;
}

describe("SimWafV2 associations", () => {
  it("puts a web ACL in front of a REST API stage and reads it back", async () => {
    // Given a deployed stage and a REGIONAL web ACL.
    const simAws = new SimAws();
    const restApi = await deployedRestApi(simAws);
    const waf = simAws.wafV2();
    const webAcl = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "api-acl" }),
    );

    // When the web ACL is associated with the stage.
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAcl.ARN,
        ResourceArn: restApi.stageArn("prod"),
      }),
    );
    const read = await waf.getWebAclForResource(
      new GetWebACLForResourceCommand({
        ResourceArn: restApi.stageArn("prod"),
      }),
    );

    // Then the stage reports the whole web ACL it now carries.
    assertNonNullable(read.WebACL);
    assertIdentical(read.WebACL.Name, "api-acl");
    assertIdentical(read.WebACL.ARN, webAcl.ARN);
  });

  it("lists the resources one web ACL protects", async () => {
    // Given one web ACL in front of two stages of an API.
    const simAws = new SimAws();
    const restApi = await deployedRestApi(simAws);
    await simAws.apiGateway().createDeployment({
      input: { restApiId: restApi.apiId, stageName: "test" },
    });
    const waf = simAws.wafV2();
    const webAcl = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make(),
    );

    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAcl.ARN,
        ResourceArn: restApi.stageArn("prod"),
      }),
    );
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAcl.ARN,
        ResourceArn: restApi.stageArn("test"),
      }),
    );

    // When the resources it protects are listed.
    const listed = await waf.listResourcesForWebAcl(
      new ListResourcesForWebACLCommand({
        WebACLArn: webAcl.ARN,
        ResourceType: "API_GATEWAY",
      }),
    );

    // Then both stages are named, in the order they were associated.
    assertArrayEquals(listed.ResourceArns, [
      restApi.stageArn("prod"),
      restApi.stageArn("test"),
    ]);
  });

  it("reports no web ACL for a stage nothing is in front of", async () => {
    // Given a deployed stage no web ACL was associated with.
    const simAws = new SimAws();
    const restApi = await deployedRestApi(simAws);

    // When the stage's web ACL is asked for.
    const read = await simAws.wafV2().getWebAclForResource(
      new GetWebACLForResourceCommand({
        ResourceArn: restApi.stageArn("prod"),
      }),
    );

    // Then nothing comes back, rather than an error.
    assertUndefined(read.WebACL);
  });

  it("takes a web ACL back off a stage", async () => {
    // Given a stage a web ACL is in front of.
    const simAws = new SimAws();
    const restApi = await deployedRestApi(simAws);
    const waf = simAws.wafV2();
    const webAcl = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make(),
    );
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAcl.ARN,
        ResourceArn: restApi.stageArn("prod"),
      }),
    );

    // When it is disassociated.
    await waf.disassociateWebAcl(
      new DisassociateWebACLCommand({
        ResourceArn: restApi.stageArn("prod"),
      }),
    );
    const read = await waf.getWebAclForResource(
      new GetWebACLForResourceCommand({
        ResourceArn: restApi.stageArn("prod"),
      }),
    );
    const listed = await waf.listResourcesForWebAcl(
      new ListResourcesForWebACLCommand({
        WebACLArn: webAcl.ARN,
        ResourceType: "API_GATEWAY",
      }),
    );

    // Then the stage carries nothing and the web ACL protects nothing.
    assertUndefined(read.WebACL);
    assertArrayEquals(listed.ResourceArns, []);
  });

  it("moves a stage from one web ACL to another", async () => {
    // Given a stage a first web ACL is in front of.
    const simAws = new SimAws();
    const restApi = await deployedRestApi(simAws);
    const waf = simAws.wafV2();
    const first = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "first-acl" }),
    );
    const second = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "second-acl" }),
    );
    const stageArn = restApi.stageArn("prod");

    // When a second web ACL is associated with the same stage.
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: first.ARN,
        ResourceArn: stageArn,
      }),
    );
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: second.ARN,
        ResourceArn: stageArn,
      }),
    );

    const read = await waf.getWebAclForResource(
      new GetWebACLForResourceCommand({ ResourceArn: stageArn }),
    );
    const listedFirst = await waf.listResourcesForWebAcl(
      new ListResourcesForWebACLCommand({
        WebACLArn: first.ARN,
        ResourceType: "API_GATEWAY",
      }),
    );

    // Then the stage carries the second one, and the first is in front of
    // nothing. A resource has one web ACL, so the second replaces the first.
    assertIdentical(read.WebACL?.Name, "second-acl");
    assertArrayEquals(listedFirst.ResourceArns, []);
  });

  it("refuses to delete a web ACL that is in front of a stage", async () => {
    // Given a web ACL protecting a stage.
    const simAws = new SimAws();
    const restApi = await deployedRestApi(simAws);
    const waf = simAws.wafV2();
    const input = simWafCreateWebAclFactory.make();
    const webAcl = await createSimWafWebAcl(waf, input);
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: webAcl.ARN,
        ResourceArn: restApi.stageArn("prod"),
      }),
    );

    // When the web ACL is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.deleteWebAcl(
        new DeleteWebACLCommand({
          Name: input.Name,
          Scope: "REGIONAL",
          Id: webAcl.Id,
          LockToken: webAcl.LockToken,
        }),
      );
    });

    // Then it is refused, naming the stage still pointing at it.
    assertInstanceOf(error, SimWafAssociatedItemException);
    assertStringIncludes(error.message, restApi.stageArn("prod"));
  });
});
