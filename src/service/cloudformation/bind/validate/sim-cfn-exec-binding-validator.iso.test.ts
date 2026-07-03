import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnExecutableResourceBinding } from "../sim-cfn-exec-binding.type.js";
import { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { validateSimCfnExecutableResourceBindings } from "./sim-cfn-exec-binding-validator.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";

describe("Sim CloudFormation executable binding validation", () => {
  it("allows missing and empty bindings", () => {
    const resources = resourceMap([cloudFrontFunction("RewriteFunction")]);

    assertUndefined(
      validationError(() => {
        validateBindings(resources, undefined);
      }),
    );
    assertUndefined(
      validationError(() => {
        validateBindings(resources, []);
      }),
    );
  });

  it("allows bindings resolved by each supported target type", () => {
    const rewriteFunction = cloudFrontFunction(
      "RewriteFunction",
      { Name: "rewrite-function" },
      { "aws:cdk:path": "TestStack/RewriteFunction" },
    );
    const accountId = rewriteFunction.accountRegionScope.accountId;
    const resources = resourceMap([rewriteFunction]);

    const bindings: readonly SimCfnExecutableResourceBinding[] = [
      { logicalId: "RewriteFunction", handler: noopHandler },
      { functionName: "rewrite-function", handler: noopHandler },
      {
        arn: `arn:aws:cloudfront::${accountId}:function/rewrite-function`,
        handler: noopHandler,
      },
      { cdkPath: "TestStack/RewriteFunction", handler: noopHandler },
    ];

    assertUndefined(
      validationError(() => {
        validateBindings(resources, bindings);
      }),
    );
  });

  it("uses the logical ID as the CloudFront Function name fallback", () => {
    const rewriteFunction = cloudFrontFunction("RewriteFunction", { Name: "" });
    const accountId = rewriteFunction.accountRegionScope.accountId;
    const resources = resourceMap([rewriteFunction]);

    const bindings: readonly SimCfnExecutableResourceBinding[] = [
      { functionName: "RewriteFunction", handler: noopHandler },
      {
        arn: `arn:aws:cloudfront::${accountId}:function/RewriteFunction`,
        handler: noopHandler,
      },
    ];

    assertUndefined(
      validationError(() => {
        validateBindings(resources, bindings);
      }),
    );
  });

  it("allows cdkPath bindings resolved from aws:cdk:logicalId metadata", () => {
    const resources = resourceMap([
      cloudFrontFunction(
        "RewriteFunction",
        {},
        { "aws:cdk:logicalId": "SynthesizedRewriteFunction1234" },
      ),
    ]);

    assertUndefined(
      validationError(() => {
        validateBindings(resources, [
          {
            cdkPath: "SynthesizedRewriteFunction1234",
            handler: noopHandler,
          },
        ]);
      }),
    );
  });

  it("throws diagnostic errors for unresolved binding targets", () => {
    const resources = resourceMap([
      cloudFrontFunction("RewriteFunction", { Name: "rewrite-function" }),
    ]);

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
      const error = validationError(() => {
        validateBindings(resources, [testCase.binding]);
      });

      assertIdentical(error?.message, testCase.expectedMessage);
    }
  });

  it("does not resolve functionName bindings against non-CloudFront-Function Resources", () => {
    const resources = resourceMap([
      resource("RewriteFunction", {
        Type: "AWS::S3::Bucket",
        Properties: { Name: "rewrite-function" },
      }),
    ]);

    const error = validationError(() => {
      validateBindings(resources, [
        { functionName: "rewrite-function", handler: noopHandler },
      ]);
    });

    assertIdentical(
      error?.message,
      'Invalid sim CloudFormation executable binding in Stack TestStack: functionName "rewrite-function" does not resolve to a Resource in the Stack',
    );
  });

  it("does not resolve cdkPath bindings from invalid Resource metadata", () => {
    const resources = resourceMap([
      cloudFrontFunction("StringMetadata", {}, "TestStack/StringMetadata"),
      cloudFrontFunction("ArrayMetadata", {}, ["TestStack/ArrayMetadata"]),
    ]);

    const error = validationError(() => {
      validateBindings(resources, [
        { cdkPath: "TestStack/StringMetadata", handler: noopHandler },
      ]);
    });

    assertIdentical(
      error?.message,
      'Invalid sim CloudFormation executable binding in Stack TestStack: cdkPath "TestStack/StringMetadata" does not resolve to a Resource in the Stack',
    );
  });

  it("reports the first unresolved binding after earlier bindings resolve", () => {
    const resources = resourceMap([cloudFrontFunction("RewriteFunction")]);

    const error = validationError(() => {
      validateBindings(resources, [
        { logicalId: "RewriteFunction", handler: noopHandler },
        { functionName: "missing-function", handler: noopHandler },
        { logicalId: "AlsoMissing", handler: noopHandler },
      ]);
    });

    assertIdentical(
      error?.message,
      'Invalid sim CloudFormation executable binding in Stack TestStack: functionName "missing-function" does not resolve to a Resource in the Stack',
    );
  });

  it("JSON-escapes diagnostic binding descriptions", () => {
    const resources = resourceMap([cloudFrontFunction("RewriteFunction")]);

    const error = validationError(() => {
      validateBindings(resources, [
        { logicalId: 'Missing"Function', handler: noopHandler },
      ]);
    });

    assertIdentical(
      error?.message,
      String.raw`Invalid sim CloudFormation executable binding in Stack TestStack: logicalId "Missing\"Function" does not resolve to a Resource in the Stack`,
    );
  });
});

function validateBindings(
  resources: ReadonlyMap<string, SimCfnResource>,
  bindings: readonly SimCfnExecutableResourceBinding[] | undefined,
): void {
  validateSimCfnExecutableResourceBindings({
    stackName: "TestStack",
    resources,
    bindings,
  });
}

function resourceMap(
  resources: readonly SimCfnResource[],
): ReadonlyMap<string, SimCfnResource> {
  return new Map(
    resources.map((resourceValue) => [resourceValue.logicalId, resourceValue]),
  );
}

function cloudFrontFunction(
  logicalId: string,
  properties: Record<string, unknown> = {},
  metadata?: unknown,
): SimCfnResource {
  return resource(logicalId, {
    Type: "AWS::CloudFront::Function",
    Properties: {
      FunctionCode: "function handler(event) { return event.request; }",
      FunctionConfig: { Runtime: "cloudfront-js-2.0" },
      ...properties,
    },
    ...(metadata === undefined ? {} : { Metadata: metadata }),
  } as SimCfnTemplateValueRecord);
}

function resource(
  logicalId: string,
  template: SimCfnTemplateValueRecord,
): SimCfnResource {
  const simAws = new SimAws();

  return new SimCfnResource({
    accountRegionScope: simAws.accountRegionScope().accountRegionScope,
    logicalId,
    template,
  });
}

function validationError(validate: () => void): Error | undefined {
  try {
    validate();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new TypeError("Expected validation to throw an Error", {
      cause: error,
    });
  }

  return undefined;
}

function noopHandler(): void {
  // noop
}
