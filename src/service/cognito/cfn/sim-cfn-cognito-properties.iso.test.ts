import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  deployFailure,
  deploySuccess,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

const appPool = {
  Type: "AWS::Cognito::UserPool",
  Properties: { UserPoolName: "myapp-users" },
};

describe("Cognito CloudFormation property shapes", () => {
  it("reads the string forms CloudFormation carries values in", async () => {
    // Given a template whose booleans and numbers are quoted, as
    // CloudFormation carries them in places.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppPool: {
            Type: "AWS::Cognito::UserPool",
            Properties: {
              UserPoolName: "myapp-users",
              Policies: {
                PasswordPolicy: {
                  MinimumLength: "12",
                  RequireSymbols: "false",
                },
              },
            },
          },
          AppClient: {
            Type: "AWS::Cognito::UserPoolClient",
            Properties: {
              UserPoolId: { Ref: "AppPool" },
              ClientName: "web",
              GenerateSecret: "true",
              AccessTokenValidity: "30",
              TokenValidityUnits: { AccessToken: "minutes" },
            },
          },
          AdminsGroup: {
            Type: "AWS::Cognito::UserPoolGroup",
            Properties: {
              UserPoolId: { Ref: "AppPool" },
              GroupName: "admins",
              Precedence: "5",
            },
          },
        },
        Outputs: { PoolId: { Value: { Ref: "AppPool" } } },
      },
    });
    await stack.waitForDeployComplete();

    // Then each is read as the value it stands for.
    const userPoolId = stack.outputs.get("PoolId")?.value;
    assertTypeString(userPoolId);

    const pool = simAws.cognitoIdentityProvider().userPool(userPoolId);
    assertIdentical(pool.passwordPolicy.minimumLength, 12);
    assertFalse(pool.passwordPolicy.requiresSymbols);

    const client = pool.clients[0];
    assertNonNullable(client);
    assertTrue(client.hasSecret);
    assertIdentical(client.tokenValidity.accessToken.seconds, 30 * 60);

    assertIdentical(pool.findGroup("admins")?.precedence, 5);
  });

  it("passes a sign-in policy through to the refusal that explains it", async () => {
    // Given a template asking for a pool that chooses its first auth factor.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          Policies: {
            SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD"] },
          },
        },
      },
    });

    // Then the CreateUserPool refusal is what reports it, rather than the
    // property being dropped on the way there.
    assertStringIncludes(
      error.message,
      "CreateUserPool Policies SignInPolicy is not simulated",
    );
  });

  it("records a nested property key it does not model", async () => {
    // Given templates carrying a key nothing reads inside each of the nested
    // objects.
    const passwordPolicyStack = await deploySuccess(simAwsInEuWest2(), {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          Policies: { PasswordPolicy: { RequireEmoji: true } },
        },
      },
    });
    const unitsStack = await deploySuccess(simAwsInEuWest2(), {
      AppPool: appPool,
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          TokenValidityUnits: { SessionToken: "minutes" },
        },
      },
    });

    // Then each is recorded at the level it sits at, rather than dropped on
    // the way to the Command with nothing said about it.
    const [passwordPolicyReason] = ignoredReasons(passwordPolicyStack);
    assertNonNullable(passwordPolicyReason);
    assertStringIncludes(
      passwordPolicyReason,
      "property Policies PasswordPolicy RequireEmoji is not simulated",
    );

    const [unitsReason] = ignoredReasons(unitsStack);
    assertNonNullable(unitsReason);
    assertStringIncludes(
      unitsReason,
      "property TokenValidityUnits SessionToken is not simulated",
    );
  });

  it("refuses a Policies value that is not an object", async () => {
    // Given a template whose Policies is a string.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users", Policies: "strict" },
      },
    });

    // Then the failure says what it should have been.
    assertStringIncludes(
      error.message,
      "AWS::Cognito::UserPool AppPool: Policies must be an object",
    );
  });

  it("refuses an ExplicitAuthFlows that is not a list of strings", async () => {
    // Given a template whose ExplicitAuthFlows is a single string.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: appPool,
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ExplicitAuthFlows: "ALLOW_ADMIN_USER_PASSWORD_AUTH",
        },
      },
    });

    // Then the failure says a list was expected.
    assertStringIncludes(
      error.message,
      "AWS::Cognito::UserPoolClient AppClient: ExplicitAuthFlows must be a " +
        "list of strings",
    );
  });

  it("refuses a list entry that is not a string", async () => {
    // Given a template whose ExplicitAuthFlows holds a number.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: appPool,
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ExplicitAuthFlows: [7],
        },
      },
    });

    // Then the failure names the entry that was wrong.
    assertStringIncludes(
      error.message,
      "AWS::Cognito::UserPoolClient AppClient: ExplicitAuthFlows[0] must be " +
        "a string",
    );
  });

  it("refuses a number property that is not a number", async () => {
    // Given templates whose Precedence is a word and a boolean, neither of
    // which CloudFormation would carry a number as.
    const groupWithPrecedence = (
      precedence: string | boolean,
    ): SimCfnTemplateValueRecord => ({
      AppPool: appPool,
      AdminsGroup: {
        Type: "AWS::Cognito::UserPoolGroup",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          GroupName: "admins",
          Precedence: precedence,
        },
      },
    });

    // When each is deployed.
    const wordError = await deployFailure(
      simAwsInEuWest2(),
      groupWithPrecedence("highest"),
    );
    const booleanError = await deployFailure(
      simAwsInEuWest2(),
      groupWithPrecedence(true),
    );

    // Then both failures say what it should have been.
    const expected =
      "AWS::Cognito::UserPoolGroup AdminsGroup: Precedence must be a number";
    assertStringIncludes(wordError.message, expected);
    assertStringIncludes(booleanError.message, expected);
  });

  it("refuses a boolean property that is not a boolean", async () => {
    // Given a template whose GenerateSecret is a word.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: appPool,
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          GenerateSecret: "yes",
        },
      },
    });

    // Then the failure says what it should have been.
    assertStringIncludes(
      error.message,
      "AWS::Cognito::UserPoolClient AppClient: GenerateSecret must be a boolean",
    );
  });

  it("refuses a TokenValidityUnits that is not an object", async () => {
    // Given a template whose TokenValidityUnits is a list.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: appPool,
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          TokenValidityUnits: ["minutes"],
        },
      },
    });

    // Then the failure says what it should have been.
    assertStringIncludes(error.message, "TokenValidityUnits must be an object");
  });

  it("refuses a client naming no user pool", async () => {
    // Given a template whose client has no UserPoolId at all.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: { ClientName: "web" },
      },
    });

    // Then the failure says the pool has to be named.
    assertStringIncludes(
      error.message,
      "AWS::Cognito::UserPoolClient AppClient: UserPoolId must be a string",
    );
  });
});
