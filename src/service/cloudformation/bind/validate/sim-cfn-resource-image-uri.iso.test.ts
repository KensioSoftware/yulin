import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simCfnResourceFactory } from "../../resource/sim-cfn-resource.factory.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { SimCfnResourceImageUri } from "./sim-cfn-resource-image-uri.js";

const ordersImageUri =
  "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:latest";

const imageCode: SimCfnTemplateValueRecord = {
  Code: { ImageUri: ordersImageUri },
};

function imageUriOf(
  type: string,
  properties: SimCfnTemplateValueRecord,
): string | undefined {
  const resource = simCfnResourceFactory.make({
    logicalId: "OrdersFunction",
    template: { Type: type, Properties: properties },
  });

  return new SimCfnResourceImageUri(resource).value();
}

describe("Sim CloudFormation Resource image URI", () => {
  it("reads the image URI of a container image function", () => {
    // Given a Lambda function Resource naming a container image.
    // When its image URI is read.
    // Then it is the URI the template resolved to.
    assertIdentical(
      imageUriOf("AWS::Lambda::Function", imageCode),
      ordersImageUri,
    );
  });

  it("has no image URI for a Resource of another type", () => {
    // Given a Resource that is not a Lambda function, whatever it declares.
    // When its image URI is read.
    // Then there is none, so no image binding can reach it.
    assertUndefined(imageUriOf("AWS::S3::Bucket", imageCode));
  });

  it("has no image URI without an image URI string in Code", () => {
    // Given Lambda functions whose Code is missing, is not an object, or does
    // not name an image, which a hand-written template can produce.
    const cases: readonly SimCfnTemplateValueRecord[] = [
      {},
      { Code: {} },
      { Code: { ZipFile: "exports.handler = async () => 'code';" } },
      { Code: { ImageUri: 42 } },
      { Code: "orders.zip" },
      { Code: ["orders.zip"] },
      { Code: null },
    ];

    // When each one's image URI is read.
    // Then there is none to match a binding against.
    for (const properties of cases) {
      assertUndefined(imageUriOf("AWS::Lambda::Function", properties));
    }
  });
});
