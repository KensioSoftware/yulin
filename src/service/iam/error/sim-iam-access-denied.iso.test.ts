import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIamAccessDenied, SimIamError } from "./sim-iam.error.js";

describe("SimIamAccessDenied", () => {
  it("uses an AWS-style authorization failure message", () => {
    const error = new SimIamAccessDenied({
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::123456789012:user/mateojackson",
      },
      action: "widgets:GetWidget",
      resource: "my-example-widget",
    });

    assertIdentical(
      error.message,
      "User: arn:aws:iam::123456789012:user/mateojackson is not authorized to perform: widgets:GetWidget on resource: my-example-widget",
    );
  });

  it("exposes AWS SDK-style error information", () => {
    const error = new SimIamAccessDenied({
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::123456789012:role/ApplicationRole",
      },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example.txt",
    });

    assertInstanceOf(error, Error);
    assertInstanceOf(error, SimIamError);
    assertIdentical(error.name, "AccessDenied");
    assertObjectEquals(error.$metadata, { httpStatusCode: 403 });
    assertObjectMatches(error.caller, {
      kind: "arn",
      arn: "arn:aws:iam::123456789012:role/ApplicationRole",
    });
    assertIdentical(error.action, "s3:GetObject");
    assertIdentical(error.resource, "arn:aws:s3:::example-bucket/example.txt");
  });
});
