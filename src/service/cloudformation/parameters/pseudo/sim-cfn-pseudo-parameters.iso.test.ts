import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

/* oxlint-disable no-template-curly-in-string */

describe("sim CloudFormation pseudo parameters", () => {
  it("resolves pseudo parameters in deployed Resource properties", async () => {
    const simAws = new SimAws();
    const cloudFormation = simAws
      .account("123456789012")
      .region("eu-west-2")
      .cloudFormation();

    const stack = await cloudFormation.deployTemplate({
      stackName: "PseudoResourceStack",
      template: {
        Resources: {
          PseudoHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              AccountId: {
                Ref: "AWS::AccountId",
              },
              Region: {
                Ref: "AWS::Region",
              },
              Partition: {
                Ref: "AWS::Partition",
              },
              StackName: {
                Ref: "AWS::StackName",
              },
              StackId: {
                Ref: "AWS::StackId",
              },
              NotificationARNs: {
                Ref: "AWS::NotificationARNs",
              },
              NoValue: {
                Ref: "AWS::NoValue",
              },
              URLSuffix: {
                Ref: "AWS::URLSuffix",
              },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    const resource = stack.getResource("PseudoHandle");

    assertNonNullable(resource);
    assertIdentical(resource.properties["AccountId"], "123456789012");
    assertIdentical(resource.properties["Region"], "eu-west-2");
    assertIdentical(resource.properties["Partition"], "aws");
    assertIdentical(resource.properties["StackName"], "PseudoResourceStack");
    assertIdentical(resource.properties["StackId"], "PseudoResourceStack");
    assertIdentical(resource.properties["NoValue"], "");
    assertIdentical(resource.properties["URLSuffix"], "sim-aws.localhost");

    const notificationARNs = resource.properties["NotificationARNs"];

    assertArrayEmpty(notificationARNs);
  });

  it("resolves pseudo parameters in deployed Stack Outputs", async () => {
    const simAws = new SimAws();
    const cloudFormation = simAws
      .account("123456789012")
      .region("ap-southeast-2")
      .cloudFormation();

    const stack = await cloudFormation.deployTemplate({
      stackName: "PseudoOutputStack",
      template: {
        Resources: {
          PseudoHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
          },
        },
        Outputs: {
          AccountId: {
            Value: {
              Ref: "AWS::AccountId",
            },
          },
          Region: {
            Value: {
              Ref: "AWS::Region",
            },
          },
          Partition: {
            Value: {
              Ref: "AWS::Partition",
            },
          },
          StackName: {
            Value: {
              Ref: "AWS::StackName",
            },
          },
          StackId: {
            Value: {
              Ref: "AWS::StackId",
            },
          },
          NotificationARNs: {
            Value: {
              Ref: "AWS::NotificationARNs",
            },
          },
          NoValue: {
            Value: {
              Ref: "AWS::NoValue",
            },
          },
          URLSuffix: {
            Value: {
              Ref: "AWS::URLSuffix",
            },
          },
          ResourceAndPseudoSummary: {
            Value: {
              "Fn::Sub":
                "${AWS::Partition}:${AWS::Region}:${AWS::AccountId}:${PseudoHandle}",
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    assertIdentical(stack.outputs.get("AccountId")?.value, "123456789012");
    assertIdentical(stack.outputs.get("Region")?.value, "ap-southeast-2");
    assertIdentical(stack.outputs.get("Partition")?.value, "aws");
    assertIdentical(stack.outputs.get("StackName")?.value, "PseudoOutputStack");
    assertIdentical(stack.outputs.get("StackId")?.value, "PseudoOutputStack");
    assertIdentical(stack.outputs.get("NoValue")?.value, "");
    assertIdentical(stack.outputs.get("URLSuffix")?.value, "sim-aws.localhost");
    assertIdentical(
      stack.outputs.get("ResourceAndPseudoSummary")?.value,
      "aws:ap-southeast-2:123456789012:PseudoHandle",
    );

    const notificationARNs = stack.outputs.get("NotificationARNs")?.value;

    assertArrayEmpty(notificationARNs);
  });

  it("uses default account and region pseudo parameters from the top-level SimAws CloudFormation service", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "DefaultPseudoStack",
      template: {
        Resources: {
          PseudoHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
          },
        },
        Outputs: {
          AccountId: {
            Value: {
              Ref: "AWS::AccountId",
            },
          },
          Region: {
            Value: {
              Ref: "AWS::Region",
            },
          },
          URLSuffix: {
            Value: {
              Ref: "AWS::URLSuffix",
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    assertIdentical(stack.outputs.get("AccountId")?.value, "888888888888");
    assertIdentical(stack.outputs.get("Region")?.value, "us-east-1");
    assertIdentical(stack.outputs.get("URLSuffix")?.value, "sim-aws.localhost");
  });
});
