import {
  assertStringIncludes,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  createUserPoolRefusal,
  deploySuccess,
  ignoredReason,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

/**
 * The AWS::Cognito::UserPool properties CreateUserPool refuses by name, and a
 * value real Cognito would take for each.
 */
const refusedPoolProperties: Readonly<Record<string, SimCfnTemplateValue>> = {
  EmailConfiguration: { EmailSendingAccount: "DEVELOPER" },
  SmsConfiguration: { SnsCallerArn: "arn:aws:iam::111122223333:role/sms" },
  SmsAuthenticationMessage: "Your code is {####}",
};

describe("Cognito CloudFormation properties the Cognito commands refuse", () => {
  for (const [label, value] of Object.entries(refusedPoolProperties)) {
    it(`says what CreateUserPool says about a pool ${label}`, async () => {
      // Given a template asking for a pool messaging property real Cognito
      // takes and this simulation delivers nothing through.
      const simAws = simAwsInEuWest2();

      // When it is deployed.
      const stack = await deploySuccess(simAws, {
        AppPool: {
          Type: "AWS::Cognito::UserPool",
          Properties: { UserPoolName: "myapp-users", [label]: value },
        },
      });

      // Then the pool is deployed without it, as best effort deployment says.
      assertTrue(stack.getResource("AppPool")?.deployed);

      // And the record carries the sentence CreateUserPool refuses the same
      // input with, in place of the generic list of simulated properties.
      const refusal = await createUserPoolRefusal(label, value);
      const [, feature] = refusal.split("is not simulated: ", 2);
      assertTypeString(feature);

      const reason = ignoredReason(stack, label);
      assertStringIncludes(reason, `${label} is not simulated: ${feature}`);
      assertStringIncludes(reason, "The Resource is created without it.");
    });
  }

  it("deploys a pool asking for every one of them at once", async () => {
    // Given the template a CDK pool moved onto SES and an SNS SMS role emits.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users", ...refusedPoolProperties },
      },
    });

    // Then the pool is there and every property is on the record.
    assertTrue(stack.getResource("AppPool")?.deployed);

    for (const label of Object.keys(refusedPoolProperties)) {
      assertStringIncludes(
        ignoredReason(stack, label),
        "would be ignored here and applied on real AWS",
      );
    }
  });
});
