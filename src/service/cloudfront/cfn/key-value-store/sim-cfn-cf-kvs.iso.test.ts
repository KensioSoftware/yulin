import {
  DescribeKeyValueStoreCommand,
  PutKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";

const redirectSource = `
  import cf from "cloudfront";

  async function handler(event) {
    const request = event.request;

    if (await cf.kvs().exists(request.uri)) {
      request.uri = await cf.kvs().get(request.uri);
    }

    return request;
  }
`;

/**
 * A Stack with a key value store and a Function that associates it.
 */
function storeAndFunctionTemplate(): CfnTemplateBodyRecord {
  return {
    Resources: {
      Redirects: {
        Type: "AWS::CloudFront::KeyValueStore",
        Properties: { Name: "redirects", Comment: "Where old paths go" },
      },
      RedirectFunction: {
        Type: "AWS::CloudFront::Function",
        Properties: {
          Name: "redirect-cff",
          AutoPublish: true,
          FunctionCode: redirectSource,
          FunctionConfig: {
            Comment: "Redirects from a key value store",
            Runtime: "cloudfront-js-2.0",
            // CloudFormation takes a plain array here, not Quantity and Items,
            // and Ref on a key value store is its ARN.
            KeyValueStoreAssociations: [
              { KeyValueStoreARN: { Ref: "Redirects" } },
            ],
          },
        },
      },
    },
  };
}

describe("AWS::CloudFront::KeyValueStore", () => {
  it("creates a store a Function in the same template can read", async () => {
    // Given a Stack declaring a store and a Function that associates it
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "redirect-stack",
      template: storeAndFunctionTemplate(),
    });
    await stack.waitForDeployComplete();

    // When a key is written to the deployed store
    const store = simAws.cloudFront().keyValueStores().byName("redirects");
    assertNonNullable(store);

    const data = simAws.cloudFrontKeyValueStore();
    const described = await data.describeKeyValueStore(
      new DescribeKeyValueStoreCommand({ KvsARN: store.arn }),
    );
    await data.putKey(
      new PutKeyCommand({
        KvsARN: store.arn,
        Key: "/old",
        Value: "/new",
        IfMatch: described.ETag,
      }),
    );

    // Then the Function the same template created reads it
    const cff = simAws.cloudFront().getCloudFrontFunctionByName("redirect-cff");
    assertNonNullable(cff);
    assertIdentical(cff.keyValueStore?.arn, store.arn);

    const result = await cff.handleViewerRequest(
      new Request("https://cdn.test/old"),
    );
    assertInstanceOf(result, Request);
    assertIdentical(new URL(result.url).pathname, "/new");
  });

  it("resolves Ref to the ARN and each supported attribute", async () => {
    // Given a Stack whose Outputs read the store every way CloudFormation
    // offers
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "outputs-stack",
      template: {
        Resources: {
          Redirects: {
            Type: "AWS::CloudFront::KeyValueStore",
            Properties: { Name: "redirects" },
          },
        },
        Outputs: {
          StoreRef: { Value: { Ref: "Redirects" } },
          StoreArn: { Value: { "Fn::GetAtt": ["Redirects", "Arn"] } },
          StoreId: { Value: { "Fn::GetAtt": ["Redirects", "Id"] } },
          StoreStatus: { Value: { "Fn::GetAtt": ["Redirects", "Status"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When the Outputs are read
    const store = simAws.cloudFront().keyValueStores().byName("redirects");
    assertNonNullable(store);

    // Then Ref is the ARN, which is what a Function's KeyValueStoreARN wants
    assertIdentical(stack.outputs.get("StoreRef")?.value, store.arn);
    assertIdentical(stack.outputs.get("StoreArn")?.value, store.arn);
    assertIdentical(stack.outputs.get("StoreId")?.value, store.id);
    // The Status Output holds what the store's status was when the Outputs
    // were resolved, which is while it was still provisioning. The store
    // itself goes on to become READY.
    assertIdentical(stack.outputs.get("StoreStatus")?.value, "PROVISIONING");
    await simAws.backgroundTasksComplete();
    assertIdentical(store.status, "READY");
  });

  it("removes the store when the Stack is torn down", async () => {
    // Given a deployed Stack with a store and the Function holding it
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "teardown-stack",
      template: storeAndFunctionTemplate(),
    });
    await stack.waitForDeployComplete();
    assertNonNullable(simAws.cloudFront().keyValueStores().byName("redirects"));

    // When the Stack is deleted
    await simAws.cloudFormation().deleteStack({
      input: { StackName: "teardown-stack" },
    });
    await simAws.backgroundTasksComplete();

    // Then the store is gone along with the Function that held it
    assertUndefined(simAws.cloudFront().keyValueStores().byName("redirects"));
    assertUndefined(
      simAws.cloudFront().getCloudFrontFunctionByName("redirect-cff"),
    );
  });

  it("refuses a store asking to be seeded from an ImportSource", async () => {
    // Given a Stack whose store names an S3 Object to import
    const simAws = new SimAws();

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "import-stack",
        template: {
          Resources: {
            Redirects: {
              Type: "AWS::CloudFront::KeyValueStore",
              Properties: {
                Name: "redirects",
                ImportSource: {
                  SourceType: "S3",
                  SourceArn: "arn:aws:s3:::seed-bucket/redirects.json",
                },
              },
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    // Then the Stack fails rather than coming up with an empty store, which
    // would let a test pass against no data the deploy would have seeded
    assertStringStartsWith(
      error.message.includes("ImportSource") ? "ImportSource" : error.message,
      "ImportSource",
    );
  });
});
