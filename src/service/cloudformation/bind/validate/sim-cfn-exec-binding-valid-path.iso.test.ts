import { describe, it } from "vitest";
import { validateSimCfnExecutableResourceBindings } from "./sim-cfn-exec-binding-validator.js";
import { simCfnCffResourceFactory } from "../../resource/cfn/cloudfront/sim-cff-cfn.factory.js";

describe("Sim CloudFormation executable binding validation from path", () => {
  it("allows logicalId bindings resolved from CDK construct path metadata", () => {
    const resource = simCfnCffResourceFactory.make({
      logicalId: "ViewerRequestFunction48E73F66",
      metadata: {
        "aws:cdk:path": "YulinDemoWebsiteStack/ViewerRequestFunction/Resource",
      },
    });
    const resources = new Map([[resource.logicalId, resource]]);

    validateSimCfnExecutableResourceBindings({
      stackName: "TestStack",
      resources,
      bindings: [
        {
          logicalId: "ViewerRequestFunction",
          handler: noopHandler,
        },
      ],
    });
  });

  it("still allows logicalId bindings resolved from the synthesized template logical ID", () => {
    const resource = simCfnCffResourceFactory.make({
      logicalId: "ViewerRequestFunction48E73F66",
      metadata: {
        "aws:cdk:path": "YulinDemoWebsiteStack/ViewerRequestFunction/Resource",
      },
    });
    const resources = new Map([[resource.logicalId, resource]]);

    validateSimCfnExecutableResourceBindings({
      stackName: "TestStack",
      resources,
      bindings: [
        {
          logicalId: "ViewerRequestFunction48E73F66",
          handler: noopHandler,
        },
      ],
    });
  });
});

function noopHandler(): void {
  // noop
}
