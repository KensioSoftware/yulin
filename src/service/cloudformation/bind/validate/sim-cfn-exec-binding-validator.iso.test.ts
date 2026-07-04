import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimCfnExecutableResourceBinding } from "../sim-cfn-exec-binding.type.js";
import { validateSimCfnExecutableResourceBindings } from "./sim-cfn-exec-binding-validator.js";
import { simCfnResourceFactory } from "../../resource/sim-cfn-resource.factory.js";
import { simCfnCffResourceFactory } from "../../resource/cfn/cloudfront/sim-cff-cfn.factory.js";

describe("Sim CloudFormation executable binding validation", () => {
  it("allows missing and empty bindings", () => {
    const rewriteFunction = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction",
    });
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    validateSimCfnExecutableResourceBindings({
      stackName: "TestStack",
      resources,
      bindings: undefined,
    });
    validateSimCfnExecutableResourceBindings({
      stackName: "TestStack",
      resources,
      bindings: [],
    });
  });

  it("allows bindings resolved by each supported target type", () => {
    const rewriteFunction = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction",
      properties: { Name: "rewrite-function" },
      metadata: { "aws:cdk:path": "TestStack/RewriteFunction" },
    });
    const accountId = rewriteFunction.accountRegionScope.accountId;
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    const bindings: readonly SimCfnExecutableResourceBinding[] = [
      { logicalId: "RewriteFunction", handler: noopHandler },
      { functionName: "rewrite-function", handler: noopHandler },
      {
        arn: `arn:aws:cloudfront::${accountId}:function/rewrite-function`,
        handler: noopHandler,
      },
      { cdkPath: "TestStack/RewriteFunction", handler: noopHandler },
    ];

    validateSimCfnExecutableResourceBindings({
      stackName: "TestStack",
      resources,
      bindings,
    });
  });

  it("uses the logical ID as the CloudFront Function name fallback", () => {
    const rewriteFunction = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction",
      properties: { Name: "" },
    });
    const accountId = rewriteFunction.accountRegionScope.accountId;
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    const bindings: readonly SimCfnExecutableResourceBinding[] = [
      { functionName: "RewriteFunction", handler: noopHandler },
      {
        arn: `arn:aws:cloudfront::${accountId}:function/RewriteFunction`,
        handler: noopHandler,
      },
    ];

    validateSimCfnExecutableResourceBindings({
      stackName: "TestStack",
      resources,
      bindings,
    });
  });

  it("allows cdkPath bindings resolved from aws:cdk:logicalId metadata", () => {
    const rewriteFunction = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction",
      metadata: { "aws:cdk:logicalId": "SynthesizedRewriteFunction1234" },
    });
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    validateSimCfnExecutableResourceBindings({
      stackName: "TestStack",
      resources,
      bindings: [
        {
          cdkPath: "SynthesizedRewriteFunction1234",
          handler: noopHandler,
        },
      ],
    });
  });

  it("throws diagnostic errors for unresolved binding targets", () => {
    const rewriteFunction = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction",
      properties: { Name: "rewrite-function" },
    });
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    const cases: readonly {
      readonly binding: SimCfnExecutableResourceBinding;
      readonly expectedMessage: string;
    }[] = [
      {
        binding: { logicalId: "MissingFunction", handler: noopHandler },
        expectedMessage:
          'Invalid sim CloudFormation executable binding in Stack TestStack: logicalId "MissingFunction" does not resolve to a Resource in the Stack',
      },
      {
        binding: { functionName: "missing-function", handler: noopHandler },
        expectedMessage:
          'Invalid sim CloudFormation executable binding in Stack TestStack: functionName "missing-function" does not resolve to a Resource in the Stack',
      },
      {
        binding: {
          arn: "arn:aws:cloudfront::111111111111:function/missing-function",
          handler: noopHandler,
        },
        expectedMessage:
          'Invalid sim CloudFormation executable binding in Stack TestStack: arn "arn:aws:cloudfront::111111111111:function/missing-function" does not resolve to a Resource in the Stack',
      },
      {
        binding: { cdkPath: "TestStack/MissingFunction", handler: noopHandler },
        expectedMessage:
          'Invalid sim CloudFormation executable binding in Stack TestStack: cdkPath "TestStack/MissingFunction" does not resolve to a Resource in the Stack',
      },
    ];

    for (const testCase of cases) {
      const error = assertThrowsError(() => {
        validateSimCfnExecutableResourceBindings({
          stackName: "TestStack",
          resources,
          bindings: [testCase.binding],
        });
      });

      assertIdentical(error.message, testCase.expectedMessage);
    }
  });

  it("does not resolve functionName bindings against non-CloudFront-Function Resources", () => {
    const rewriteFunction = simCfnResourceFactory.make({
      logicalId: "RewriteFunction",
      template: {
        Type: "AWS::S3::Bucket",
        Properties: { Name: "rewrite-function" },
      },
    });
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    const error = assertThrowsError(() => {
      validateSimCfnExecutableResourceBindings({
        stackName: "TestStack",
        resources,
        bindings: [{ functionName: "rewrite-function", handler: noopHandler }],
      });
    });

    assertIdentical(
      error.message,
      'Invalid sim CloudFormation executable binding in Stack TestStack: functionName "rewrite-function" does not resolve to a Resource in the Stack',
    );
  });

  it("does not resolve cdkPath bindings from invalid Resource metadata", () => {
    const stringMetadata = simCfnCffResourceFactory.make({
      logicalId: "StringMetadata",
      metadata: "TestStack/StringMetadata",
    });
    const arrayMetadata = simCfnCffResourceFactory.make({
      logicalId: "ArrayMetadata",
      metadata: ["TestStack/ArrayMetadata"],
    });
    const resources = new Map([
      [stringMetadata.logicalId, stringMetadata],
      [arrayMetadata.logicalId, arrayMetadata],
    ]);

    const error = assertThrowsError(() => {
      validateSimCfnExecutableResourceBindings({
        stackName: "TestStack",
        resources,
        bindings: [
          { cdkPath: "TestStack/StringMetadata", handler: noopHandler },
        ],
      });
    });

    assertIdentical(
      error.message,
      'Invalid sim CloudFormation executable binding in Stack TestStack: cdkPath "TestStack/StringMetadata" does not resolve to a Resource in the Stack',
    );
  });

  it("reports the first unresolved binding after earlier bindings resolve", () => {
    const rewriteFunction = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction",
    });
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    const error = assertThrowsError(() => {
      validateSimCfnExecutableResourceBindings({
        stackName: "TestStack",
        resources,
        bindings: [
          { logicalId: "RewriteFunction", handler: noopHandler },
          { functionName: "missing-function", handler: noopHandler },
          { logicalId: "AlsoMissing", handler: noopHandler },
        ],
      });
    });

    assertIdentical(
      error.message,
      'Invalid sim CloudFormation executable binding in Stack TestStack: functionName "missing-function" does not resolve to a Resource in the Stack',
    );
  });

  it("JSON-escapes diagnostic binding descriptions", () => {
    const rewriteFunction = simCfnCffResourceFactory.make({
      logicalId: "RewriteFunction",
    });
    const resources = new Map([[rewriteFunction.logicalId, rewriteFunction]]);

    const error = assertThrowsError(() => {
      validateSimCfnExecutableResourceBindings({
        stackName: "TestStack",
        resources,
        bindings: [{ logicalId: 'Missing"Function', handler: noopHandler }],
      });
    });

    assertIdentical(
      error.message,
      String.raw`Invalid sim CloudFormation executable binding in Stack TestStack: logicalId "Missing\"Function" does not resolve to a Resource in the Stack`,
    );
  });
});

function noopHandler(): void {
  // noop
}
