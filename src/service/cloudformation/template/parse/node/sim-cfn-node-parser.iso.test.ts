import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";
import { SimCfnParameters } from "../../../parameters/sim-cfn-parameters.js";
import { SimCfnFnJoin } from "../../node/fn/join/sim-cfn-fn-join.js";
import { SimCfnList } from "../../node/sim-cfn-list.js";
import { SimCfnLiteral } from "../../node/sim-cfn-literal.js";
import { SimCfnNode, SimCfnResolveContext } from "../../node/sim-cfn-node.js";
import { SimCfnObject } from "../../node/sim-cfn-object.js";
import { SimCfnRef } from "../../node/sim-cfn-ref.js";
import { parseSimCfnNode, SimCfnNodeParser } from "./sim-cfn-node-parser.js";
import { SimAws } from "../../../../aws/sim-aws.js";

describe("SimCfnNodeParser", () => {
  it("parses arrays into CloudFormation list nodes recursively", () => {
    const parser = new SimCfnNodeParser();

    const node = parser.parse(["first", 2, true]);

    assertInstanceOf(node, SimCfnList);
    assertArrayEquals(node.resolve(emptyContext()), ["first", 2, true]);
  });

  it("parses primitive values into CloudFormation literal nodes", () => {
    const parser = new SimCfnNodeParser();

    const node = parser.parse("literal-value");

    assertInstanceOf(node, SimCfnLiteral);
    assertIdentical(node.resolve(emptyContext()), "literal-value");
  });

  it("parses valid Ref objects into CloudFormation Ref nodes", () => {
    const parser = new SimCfnNodeParser();

    const node = parser.parse({ Ref: "BucketName" });

    assertInstanceOf(node, SimCfnRef);
    assertObjectMatches(node.resolve(emptyContext()), {
      Ref: "BucketName",
    });
  });

  it("leaves empty objects as plain CloudFormation objects", () => {
    const parser = new SimCfnNodeParser();

    const node = parser.parse({});

    assertInstanceOf(node, SimCfnObject);
    assertObjectMatches(node.resolve(emptyContext()), {});
  });

  it("leaves non-function single-entry objects as plain CloudFormation objects", () => {
    const parser = new SimCfnNodeParser();

    const node = parser.parse({ BucketName: "test-bucket" });

    assertInstanceOf(node, SimCfnObject);
    assertObjectMatches(node.resolve(emptyContext()), {
      BucketName: "test-bucket",
    });
  });

  it("parses Fn::Join objects into CloudFormation Fn::Join nodes", () => {
    const parser = new SimCfnNodeParser();

    const node = parser.parse({
      "Fn::Join": ["-", ["my", "test", "bucket"]],
    });

    assertInstanceOf(node, SimCfnFnJoin);
    assertIdentical(node.resolve(emptyContext()), "my-test-bucket");
  });

  it("throws when an intrinsic function is unsupported", () => {
    const parser = new SimCfnNodeParser();

    const error = assertThrowsError(() => {
      parser.parse({
        "Fn::Unsupported": "value",
      });
    });

    assertIdentical(
      error.message,
      "Unsupported Sim CloudFormation intrinsic function Fn::Unsupported",
    );
  });

  it("throws when an intrinsic function is not the only object entry", () => {
    const parser = new SimCfnNodeParser();

    const error = assertThrowsError(() => {
      parser.parse({
        Name: "test-bucket",
        "Fn::Join": ["-", ["my", "bucket"]],
      });
    });

    assertIdentical(
      error.message,
      "Malformed Sim CloudFormation intrinsic function object Fn::Join",
    );
  });

  it("throws when a required single template entry is unexpectedly missing", () => {
    const parser = new SimCfnNodeParser();
    const entries = Array.from({ length: 1 });
    const objectEntries = vi.spyOn(Object, "entries");

    // @ts-expect-error -- testing bad input
    objectEntries.mockReturnValueOnce(entries);

    try {
      const error = assertThrowsError(() => {
        parser.parse({
          "Fn::Join": ["-", ["my", "bucket"]],
        });
      });

      assertIdentical(
        error.message,
        "Expected exactly one Sim CloudFormation template entry",
      );
    } finally {
      objectEntries.mockRestore();
    }
  });

  it("throws when Fn::Join value is not a two-item array", () => {
    const parser = new SimCfnNodeParser();

    const error = assertThrowsError(() => {
      parser.parse({
        "Fn::Join": ["-"],
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Join value must be [delimiter, values]",
    );
  });

  it("throws when Fn::Join delimiter is not a string", () => {
    const parser = new SimCfnNodeParser();

    const error = assertThrowsError(() => {
      parser.parse({
        "Fn::Join": [123, ["my", "bucket"]],
      });
    });

    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Join delimiter must be a string",
    );
  });

  it("throws when Fn::Join values are not an array", () => {
    const parser = new SimCfnNodeParser();

    const error = assertThrowsError(() => {
      parser.parse({
        "Fn::Join": ["-", "my-bucket"],
      });
    });

    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Join values must be an array",
    );
  });

  it("uses the exported parse function as the parser boundary", () => {
    const node = parseSimCfnNode({
      Name: {
        "Fn::Join": ["-", ["my", "bucket"]],
      },
    });

    assertInstanceOf(node, SimCfnNode);
    assertObjectMatches(node.resolve(emptyContext()), {
      Name: "my-bucket",
    });
  });

  it("throws when an intrinsic function object has extra properties", () => {
    const parser = new SimCfnNodeParser();

    const error = assertThrowsError(() => {
      parser.parse({
        "Fn::Join": ["-", ["my", "bucket"]],
        ExtraProperty: "unexpected",
      });
    });

    assertIdentical(
      error.message,
      "Malformed Sim CloudFormation intrinsic function object Fn::Join",
    );
  });

  it("throws when an unsupported intrinsic function object has extra properties", () => {
    const parser = new SimCfnNodeParser();

    const error = assertThrowsError(() => {
      parser.parse({
        "Fn::Unsupported": "value",
        ExtraProperty: "unexpected",
      });
    });

    assertIdentical(
      error.message,
      "Malformed Sim CloudFormation intrinsic function object Fn::Unsupported",
    );
  });

  it("rejects Ref values that are not strings", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: {
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: {
                  Ref: 123,
                },
              },
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Ref value must be a string",
    );
  });
});

function emptyContext(): SimCfnResolveContext {
  return new SimCfnResolveContext(new SimCfnParameters());
}
