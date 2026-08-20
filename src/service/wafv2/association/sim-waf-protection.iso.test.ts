import { assertFalse, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimApiGateway } from "../../apigateway/index.js";
import { SimWafAssociations } from "./sim-waf-associations.js";

const stageArn = "arn:aws:apigateway:eu-west-2::/restapis/abc123/stages/prod";

describe("SimWafAssociations", () => {
  it("decides nothing about a resource nothing is in front of", () => {
    // Given a scope with no association in it.
    const associations = new SimWafAssociations();

    // When a request to an unprotected resource is put to it.
    const decision = associations.decide({
      resourceArn: stageArn,
      request: new Request("https://example.test/orders"),
    });

    // Then no web ACL decided it.
    assertFalse(associations.protects(stageArn));
    assertUndefined(decision);
  });
});

describe("SimWafNoProtection", () => {
  it("puts nothing in front of a standalone API Gateway's stages", async () => {
    // Given a simulated API Gateway with no simulated AWS around it.
    const apiGateway = new SimApiGateway();
    const created = await apiGateway.createRestApi({
      input: { name: "orders" },
    });
    await apiGateway.createDeployment({
      input: { restApiId: created.id, stageName: "prod" },
    });

    const restApi = apiGateway.findRestApi(created.id);
    assertDefined(restApi, `Simulated API Gateway lost the API ${created.id}`);

    // When the stage is deleted, which lets go of whatever protected it.
    await apiGateway.deleteStage({
      input: { restApiId: created.id, stageName: "prod" },
    });

    // Then nothing was in front of the stage at any point.
    assertFalse(restApi.webAcls.protects(restApi.stageArn("prod")));
    assertUndefined(
      restApi.webAcls.decide({
        resourceArn: restApi.stageArn("prod"),
        request: new Request("https://example.test/prod/orders"),
      }),
    );
  });
});
