import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimCfnDynamicReference } from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";
import {
  requireSecureStringParameter,
  requireSsmSecureReferenceProperty,
} from "./sim-cfn-ssm-secure-refusals.js";

const reference: SimCfnDynamicReference = {
  text: "{{resolve:ssm-secure:/myapp/token}}",
  service: "ssm-secure",
  body: "/myapp/token",
};

describe("SSM CloudFormation ssm-secure reference refusals", () => {
  it("refuses a reference in a Resource carrying no Type", () => {
    // Given a Resource whose template names no type, which is nothing the
    // documented list can match.
    // When a reference in one of its properties is checked, then it is refused
    // in terms a template author can act on.
    const error = assertThrowsError(() => {
      requireSsmSecureReferenceProperty(reference, {
        resourceType: undefined,
        propertyPath: "LoginProfile.Password",
      });
    });

    assertStringIncludes(error.message, "no Type");
    assertStringIncludes(error.message, reference.text);
  });

  it("refuses a parameter Parameter Store reported no type for", () => {
    // Given a parameter read back without a type.
    // When it is checked, then it is refused rather than taken for a
    // SecureString.
    const error = assertThrowsError(() => {
      requireSecureStringParameter("/myapp/token", { Value: "hunter2" });
    });

    assertStringIncludes(error.message, "typeless");
    assertStringIncludes(error.message, "reads a SecureString");
  });
});
