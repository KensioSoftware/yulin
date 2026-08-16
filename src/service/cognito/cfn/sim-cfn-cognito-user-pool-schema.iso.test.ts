import {
  AdminGetUserCommand,
  DescribeUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployFailure,
  deploySuccess,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

const password = "Sup3rSecret!";

/**
 * The AWS::Cognito::UserPool properties `aws-cdk-lib` 2.263.0 emits for a
 * `UserPool` construct given a `customAttributes` of a string identifier and a
 * bounded number, alongside a client-side app client.
 *
 * A stack keying its own data on an identifier of the pool's is the reason
 * most templates declare a `Schema` at all.
 */
const schemaPoolResources = {
  SiteUserPool: {
    Type: "AWS::Cognito::UserPool",
    Properties: {
      UserPoolName: "myapp-users",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      Schema: [
        { Name: "userId", AttributeDataType: "String", Mutable: false },
        {
          Name: "seats",
          AttributeDataType: "Number",
          Mutable: true,
          NumberAttributeConstraints: { MinValue: 1, MaxValue: 10 },
        },
        {
          Name: "tier",
          AttributeDataType: "String",
          Mutable: true,
          StringAttributeConstraints: { MinLength: "1", MaxLength: "16" },
        },
      ],
    },
  },
  SiteUserPoolClient: {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: { Ref: "SiteUserPool" },
      ClientName: "web",
    },
  },
};

const schemaPoolOutputs = {
  PoolId: { Value: { Ref: "SiteUserPool" } },
  ClientId: { Value: { Ref: "SiteUserPoolClient" } },
};

describe("Cognito CloudFormation user pool schema", () => {
  it("deploys a pool declaring custom attributes and writes one", async () => {
    // Given a stack whose pool declares an identifier of its own.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(
      simAws,
      schemaPoolResources,
      schemaPoolOutputs,
    );

    // Then the pool deployed with nothing left out, where a Schema used to be
    // recorded as a property the pool was created without.
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);
    assertArrayLength(stack.ignoredProperties, 0);

    // And the pool reports the attributes the template declared, under the
    // names Cognito gives them.
    const cognito = simAws.cognitoIdentityProvider();
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    const seats = described.UserPool?.SchemaAttributes?.find(
      (attribute) => attribute.Name === "custom:seats",
    );

    const tier = described.UserPool?.SchemaAttributes?.find(
      (attribute) => attribute.Name === "custom:tier",
    );

    // The bounds a template writes as numbers are reported as the strings the
    // Cognito API carries them in, and the ones it wrote as strings unchanged.
    assertObjectEquals(seats?.NumberAttributeConstraints, {
      MinValue: "1",
      MaxValue: "10",
    });
    assertObjectEquals(tier?.StringAttributeConstraints, {
      MinLength: "1",
      MaxLength: "16",
    });

    // And a sign-up against the deployed pool writes one, which is the flow
    // the template was written for.
    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
        UserAttributes: [{ Name: "custom:userId", Value: "usr_01H8" }],
      }),
    );

    const user = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );
    const userId = user.UserAttributes?.find(
      (attribute) => attribute.Name === "custom:userId",
    );

    assertIdentical(userId?.Value, "usr_01H8");
  });

  it("records a Schema field it does not model", async () => {
    // Given a stack whose attribute declaration carries a field nothing here
    // reads.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(simAws, {
      SiteUserPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          Schema: [{ Name: "userId", AttributeLabel: "User id" }],
        },
      },
    });

    // Then the field is reported rather than quietly dropped.
    assertStringIncludes(
      ignoredReasons(stack).join("\n"),
      "Schema[0] AttributeLabel is not simulated",
    );
  });

  it("fails a stack whose Schema is not a list of attributes", async () => {
    // Given a stack whose Schema is a single object rather than a list.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      SiteUserPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users", Schema: { Name: "userId" } },
      },
    });

    // Then the stack fails saying what the property should have been.
    assertStringIncludes(
      error.message,
      "Schema must be a list of attribute declarations",
    );
  });

  it("fails a stack whose Schema declares something Cognito refuses", async () => {
    // Given a stack asking for a required custom attribute, which real Cognito
    // does not give.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      SiteUserPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          Schema: [{ Name: "userId", Required: true }],
        },
      },
    });

    // Then the stack fails with the words CreateUserPool would have given an
    // SDK caller, rather than deploying a pool AWS would have refused.
    assertStringIncludes(error.message, "is Required, which Cognito refuses");
  });
});
