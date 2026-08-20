import {
  AssociateWebACLCommand,
  GetWebACLForResourceCommand,
  ListResourcesForWebACLCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../util/type-guard/defined.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import {
  SimWafInvalidParameterException,
  SimWafNonexistentItemException,
  SimWafUnavailableEntityException,
  SimWafUnsimulatedInputException,
} from "./error/sim-wafv2.error.js";
import { SimWafV2 } from "./sim-wafv2.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;

/**
 * A deployed REST API stage and a REGIONAL web ACL in the same scope.
 *
 * Every refusal here is about one of the two ARNs an association carries, so
 * each test starts from a pair that would otherwise be associated.
 */
async function stageAndWebAcl(simAws: SimAws): Promise<{
  readonly stageArn: string;
  readonly webAclArn: string;
}> {
  const apiGateway = simAws.apiGateway();
  const created = await apiGateway.createRestApi({ input: { name: "orders" } });
  await apiGateway.createDeployment({
    input: { restApiId: created.id, stageName: "prod" },
  });

  const restApi = apiGateway.findRestApi(created.id);
  assertDefined(restApi, `Simulated API Gateway lost the API ${created.id}`);

  const webAcl = await createSimWafWebAcl(
    simAws.wafV2(),
    simWafCreateWebAclFactory.make(),
  );

  return { stageArn: restApi.stageArn("prod"), webAclArn: webAcl.ARN };
}

describe("SimWafV2 association refusals", () => {
  it("refuses a CLOUDFRONT scope web ACL", async () => {
    // Given a stage and a CLOUDFRONT scope web ACL.
    const simAws = new SimAws();
    const { stageArn } = await stageAndWebAcl(simAws);
    const webAcl = await createSimWafWebAcl(
      simAws.wafV2(),
      simWafCreateWebAclFactory.make({ Scope: "CLOUDFRONT" }),
    );

    // When it is associated with the stage.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAcl.ARN,
          ResourceArn: stageArn,
        }),
      );
    });

    // Then it is refused, because a distribution takes its own web ACL.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "CLOUDFRONT");
  });

  it("refuses a web ACL from another Region", async () => {
    // Given a stage in one Region and a web ACL in another.
    const simAws = new SimAws();
    const { stageArn } = await stageAndWebAcl(simAws);
    const elsewhere = await createSimWafWebAcl(
      simAws.accountRegionScope(simAws.defaultAccountId, "eu-west-2").wafV2(),
      simWafCreateWebAclFactory.make(),
    );

    // When the web ACL from elsewhere is associated with the stage.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: elsewhere.ARN,
          ResourceArn: stageArn,
        }),
      );
    });

    // Then it is refused before anything looks for it.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "eu-west-2");
  });

  it("refuses a web ACL from another Account", async () => {
    // Given a stage in one Account and a web ACL in another.
    const simAws = new SimAws();
    const { stageArn } = await stageAndWebAcl(simAws);
    const elsewhere = await createSimWafWebAcl(
      simAws.accountRegionScope(accountIdTwoTwos, "us-east-1").wafV2(),
      simWafCreateWebAclFactory.make(),
    );

    // When the other Account's web ACL is associated with the stage.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: elsewhere.ARN,
          ResourceArn: stageArn,
        }),
      );
    });

    // Then it is refused. A web ACL protects what is in its own Account.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, accountIdTwoTwos);
  });

  it("refuses a web ACL ARN that is not one", async () => {
    // Given a stage.
    const simAws = new SimAws();
    const { stageArn } = await stageAndWebAcl(simAws);

    // When something that is not a web ACL ARN is associated with it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: "api-acl",
          ResourceArn: stageArn,
        }),
      );
    });

    // Then it is refused as an ARN rather than as a missing web ACL.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "WEB_ACL_ARN");
  });

  it("refuses a web ACL that was never created", async () => {
    // Given a stage and the ARN of a web ACL nothing holds.
    const simAws = new SimAws();
    const { stageArn, webAclArn } = await stageAndWebAcl(simAws);

    // When an ARN in the right scope names no web ACL.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: `${webAclArn}-gone`,
          ResourceArn: stageArn,
        }),
      );
    });

    // Then it is refused as a resource that does not exist.
    assertInstanceOf(error, SimWafNonexistentItemException);
  });

  it("refuses an API Gateway HTTP API stage", async () => {
    // Given a web ACL and the ARN of an HTTP API stage.
    const simAws = new SimAws();
    const { webAclArn } = await stageAndWebAcl(simAws);

    // When the HTTP API stage is associated with it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn:
            "arn:aws:apigateway:us-east-1::/apis/abc123/stages/$default",
        }),
      );
    });

    // Then it is refused, naming HTTP APIs as outside what WAF protects.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "HTTP API");
  });

  it("refuses a resource type it does not simulate", async () => {
    // Given a web ACL and the ARN of a load balancer.
    const simAws = new SimAws();
    const { webAclArn } = await stageAndWebAcl(simAws);

    // When the load balancer is associated with it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn:
            "arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/app/orders/1",
        }),
      );
    });

    // Then it is refused as unsimulated rather than as an invalid ARN.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "Application Load Balancer");
  });

  it("refuses a resource ARN naming nothing WAF protects", async () => {
    // Given a web ACL.
    const simAws = new SimAws();
    const { webAclArn } = await stageAndWebAcl(simAws);

    // When something that is not a resource ARN is associated with it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn: "arn:aws:s3:::orders",
        }),
      );
    });

    // Then it is refused as an ARN.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "RESOURCE_ARN");
  });

  it("refuses an association naming no resource at all", async () => {
    // Given a web ACL.
    const simAws = new SimAws();
    const { webAclArn } = await stageAndWebAcl(simAws);

    // When the association names no resource.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn: undefined,
        }),
      );
    });

    // Then it is refused for the parameter it left out.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "ResourceArn");
  });

  it("refuses a stage in another Region", async () => {
    // Given a web ACL and a stage ARN naming a different Region.
    const simAws = new SimAws();
    const { webAclArn } = await stageAndWebAcl(simAws);

    // When the stage from elsewhere is associated with it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn:
            "arn:aws:apigateway:eu-west-2::/restapis/abc/stages/prod",
        }),
      );
    });

    // Then it is refused for the Region it named.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "eu-west-2");
  });

  it("refuses a stage that is not there", async () => {
    // Given a web ACL and an API with no such stage.
    const simAws = new SimAws();
    const { stageArn, webAclArn } = await stageAndWebAcl(simAws);

    // When a stage name nothing was deployed under is associated with it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAclArn,
          ResourceArn: stageArn.replace("/prod", "/test"),
        }),
      );
    });

    // Then it is refused as a resource WAF cannot reach.
    assertInstanceOf(error, SimWafUnavailableEntityException);
  });

  it("refuses reading the web ACL of a stage that is not there", async () => {
    // Given an API with no such stage.
    const simAws = new SimAws();
    const { stageArn } = await stageAndWebAcl(simAws);

    // When that stage's web ACL is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().getWebAclForResource(
        new GetWebACLForResourceCommand({
          ResourceArn: stageArn.replace("/prod", "/test"),
        }),
      );
    });

    // Then it is refused rather than answering with nothing.
    assertInstanceOf(error, SimWafUnavailableEntityException);
  });

  it("refuses a listing that names no resource type", async () => {
    // Given a web ACL.
    const simAws = new SimAws();
    const { webAclArn } = await stageAndWebAcl(simAws);

    // When its resources are listed without naming a type.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .wafV2()
        .listResourcesForWebAcl(
          new ListResourcesForWebACLCommand({ WebACLArn: webAclArn }),
        );
    });

    // Then it is refused. Real WAFv2 defaults to load balancers, which are not
    // simulated, so a listing that says nothing would answer with nothing.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "APPLICATION_LOAD_BALANCER");
  });

  it("has nothing to associate with when it stands on its own", async () => {
    // Given a simulated WAFv2 with no simulated AWS around it.
    const waf = new SimWafV2();
    const webAcl = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make(),
    );

    // When a stage ARN is associated with its web ACL.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.associateWebAcl(
        new AssociateWebACLCommand({
          WebACLArn: webAcl.ARN,
          ResourceArn: `arn:aws:apigateway:${webAcl.ARN.split(":", 4)[3] ?? ""}::/restapis/abc/stages/prod`,
        }),
      );
    });

    // Then there is no such resource, because a standalone WAFv2 has no API
    // Gateway to ask about one.
    assertInstanceOf(error, SimWafUnavailableEntityException);
  });
});
