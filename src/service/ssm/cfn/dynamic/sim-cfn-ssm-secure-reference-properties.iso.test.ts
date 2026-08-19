import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { acceptsSsmSecureReference } from "./sim-cfn-ssm-secure-reference-properties.js";

describe("SSM CloudFormation ssm-secure reference properties", () => {
  it("accepts the property a simulated Resource holds", () => {
    // Given the one pair on the documented list this simulation reaches.
    // When it is looked up, then it is accepted.
    assertTrue(
      acceptsSsmSecureReference("AWS::IAM::User", "LoginProfile.Password"),
    );
  });

  it("accepts a property of a Resource type nothing simulates", () => {
    // Given a pair on the documented list that no simulated Resource holds.
    // When it is looked up, then it is still accepted: the rule is
    // CloudFormation's rather than this simulation's reach.
    assertTrue(
      acceptsSsmSecureReference("AWS::RDS::DBInstance", "MasterUserPassword"),
    );
  });

  it("accepts a property inside a list", () => {
    // Given a documented property that sits inside a list, so a resolved path
    // to it carries the list position.
    // When it is looked up, then the position is not part of the match.
    assertTrue(
      acceptsSsmSecureReference(
        "AWS::OpsWorks::Stack",
        "RdsDbInstances.0.DbPassword",
      ),
    );
  });

  it("refuses a property the Resource type does not hold on the list", () => {
    // Given a property documented for another Resource type.
    // When it is looked up, then it is refused: the list is per pair.
    assertFalse(
      acceptsSsmSecureReference("AWS::IAM::User", "MasterUserPassword"),
    );
  });

  it("refuses every property of a Resource type off the list", () => {
    // Given a Resource type the list does not name at all.
    // When any property of it is looked up, then it is refused.
    assertFalse(acceptsSsmSecureReference("AWS::SQS::Queue", "Tags.0.Value"));
  });

  it("refuses a Resource with no type", () => {
    // Given a Resource whose template carries no Type.
    // When a property of it is looked up, then there is nothing to match.
    assertFalse(acceptsSsmSecureReference(undefined, "LoginProfile.Password"));
  });
});
