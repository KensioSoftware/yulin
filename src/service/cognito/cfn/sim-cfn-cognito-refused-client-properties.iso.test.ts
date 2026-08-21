import { assertStringIncludes, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deploySuccess,
  ignoredReason,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

describe("Cognito CloudFormation client properties the Cognito commands refuse", () => {
  it("says what CreateUserPoolClient says about a client WriteAttributes", async () => {
    // Given a template asking for per-client attribute permissions.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users" },
      },
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ClientName: "browser",
          WriteAttributes: ["email"],
        },
      },
    });

    // Then the client is deployed without it, and the record carries what
    // CreateUserPoolClient refuses the same input with.
    assertTrue(stack.getResource("AppClient")?.deployed);
    assertStringIncludes(
      ignoredReason(stack, "WriteAttributes"),
      "WriteAttributes is not simulated: per-client attribute permissions " +
        "would be ignored here and applied on real AWS",
    );
  });

  it("keeps the list of simulated properties for one no command refuses", async () => {
    // Given a template asking for a pool property the Cognito commands say
    // nothing about.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          DeviceConfiguration: { ChallengeRequiredOnNewDevice: true },
        },
      },
    });

    // Then the record still lists what the Resource type can act on, which is
    // the more useful answer where nothing more specific is known.
    assertStringIncludes(
      ignoredReason(stack, "DeviceConfiguration"),
      "The simulated properties are",
    );
  });
});
