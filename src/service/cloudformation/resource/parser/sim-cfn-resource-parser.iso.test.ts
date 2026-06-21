import { describe, it } from "vitest";
import { assertIdentical, assertThrowsError } from "@kensio/smartass";

import { parseSimCloudFormationResourceType } from "./sim-cfn-resource-parser.js";

describe("parseSimCloudFormationResourceType", () => {
  it("parses a valid sim CloudFormation Resource type", () => {
    // Given a valid CloudFormation-style Resource type label.
    const resourceType = "AWS::S3::Bucket";

    // When the Resource type label is parsed.
    const parsedResourceType = parseSimCloudFormationResourceType(resourceType);

    // Then the provider, service and Resource type names are extracted.
    assertIdentical(parsedResourceType.providerName, "AWS");
    assertIdentical(parsedResourceType.serviceName, "S3");
    assertIdentical(parsedResourceType.resourceTypeName, "Bucket");
  });

  it("rejects a Resource type without enough parts", () => {
    // Given a Resource type label missing the Resource type name.
    const resourceType = "AWS::S3";

    // When parsing is attempted, then it throws an invalid Resource type error.
    const error = assertThrowsError(() =>
      parseSimCloudFormationResourceType(resourceType),
    );

    // Then the original invalid Resource type is included for diagnosis.
    assertIdentical(
      error.message,
      "Invalid sim CloudFormation Resource type AWS::S3",
    );
  });

  it("rejects a Resource type with an empty provider name", () => {
    // Given a Resource type label with an empty provider segment.
    const resourceType = "::S3::Bucket";

    // When parsing is attempted, then it throws an invalid Resource type error.
    const error = assertThrowsError(() =>
      parseSimCloudFormationResourceType(resourceType),
    );

    // Then the original invalid Resource type is included for diagnosis.
    assertIdentical(
      error.message,
      "Invalid sim CloudFormation Resource type ::S3::Bucket",
    );
  });

  it("rejects a Resource type with an empty service name", () => {
    // Given a Resource type label with an empty service segment.
    const resourceType = "AWS::::Bucket";

    // When parsing is attempted, then it throws an invalid Resource type error.
    const error = assertThrowsError(() =>
      parseSimCloudFormationResourceType(resourceType),
    );

    // Then the original invalid Resource type is included for diagnosis.
    assertIdentical(
      error.message,
      "Invalid sim CloudFormation Resource type AWS::::Bucket",
    );
  });

  it("rejects a Resource type with an empty Resource type name", () => {
    // Given a Resource type label with an empty Resource type segment.
    const resourceType = "AWS::S3::";

    // When parsing is attempted, then it throws an invalid Resource type error.
    const error = assertThrowsError(() =>
      parseSimCloudFormationResourceType(resourceType),
    );

    // Then the original invalid Resource type is included for diagnosis.
    assertIdentical(
      error.message,
      "Invalid sim CloudFormation Resource type AWS::S3::",
    );
  });

  it("rejects a Resource type with too many parts", () => {
    // Given a Resource type label with an unexpected extra segment.
    const resourceType = "AWS::S3::Bucket::Extra";

    // When parsing is attempted, then it throws an invalid Resource type error.
    const error = assertThrowsError(() =>
      parseSimCloudFormationResourceType(resourceType),
    );

    // Then the original invalid Resource type is included for diagnosis.
    assertIdentical(
      error.message,
      "Invalid sim CloudFormation Resource type AWS::S3::Bucket::Extra",
    );
  });
});
