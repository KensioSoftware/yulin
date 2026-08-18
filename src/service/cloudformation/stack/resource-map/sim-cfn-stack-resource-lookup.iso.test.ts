import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

describe("SimCfnStackResourceLookup", () => {
  it("answers a hashed Resource by the construct ID it was synthesized from", async () => {
    // Given a Stack deployed from a CDK-synthesized template, whose logical ID
    // carries a hash a caller has no way to know.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cdk-lookup-stack",
      template: {
        Resources: {
          UploadsBucket9F8E7D6C: {
            Type: "AWS::S3::Bucket",
            Metadata: {
              "aws:cdk:path": "TestStack/UploadsBucket/Resource",
            },
            Properties: {
              BucketName: "cdk-lookup-uploads",
            },
          },
        },
      },
    });

    // When the Stack is asked for the Resource by construct ID.
    const resource = stack.getResource("UploadsBucket");

    // Then it answers the hashed Resource that construct synthesized.
    assertIdentical(resource?.logicalId, "UploadsBucket9F8E7D6C");
    assertIdentical(resource.properties["BucketName"], "cdk-lookup-uploads");
  });

  it("prefers a Resource whose logical ID matches exactly", async () => {
    // Given a Stack holding both a Resource named as the identifier asked for
    // and a hashed one whose construct ID is the same name.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "ambiguous-lookup-stack",
      template: {
        Resources: {
          UploadsBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "named-by-logical-id",
            },
          },
          UploadsBucket9F8E7D6C: {
            Type: "AWS::S3::Bucket",
            Metadata: {
              "aws:cdk:path": "TestStack/UploadsBucket/Resource",
            },
            Properties: {
              BucketName: "named-by-construct-id",
            },
          },
        },
      },
    });

    // When the Stack is asked for that identifier.
    const resource = stack.getResource("UploadsBucket");

    // Then the logical ID answers. Everything that resolved before construct
    // IDs were understood still resolves the same way.
    assertIdentical(resource?.logicalId, "UploadsBucket");
    assertIdentical(resource.properties["BucketName"], "named-by-logical-id");
  });

  it("answers nothing for an identifier no Resource carries", async () => {
    // Given a Stack whose one Resource was synthesized under another construct.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "missing-lookup-stack",
      template: {
        Resources: {
          UploadsBucket9F8E7D6C: {
            Type: "AWS::S3::Bucket",
            Metadata: {
              "aws:cdk:path": "TestStack/UploadsBucket/Resource",
            },
            Properties: {
              BucketName: "missing-lookup-uploads",
            },
          },
        },
      },
    });

    // When the Stack is asked for a construct that is not in it.
    // Then it answers with nothing rather than the wrong Resource.
    assertUndefined(stack.getResource("ReportsBucket"));
  });
});
