import { SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { simCfnSamFunctionTemplateFactory } from "../sim-cfn-sam-function-template.factory.js";

describe("SAM Cognito event expansion", () => {
  /**
   * A trigger that turns every sign-up down, so a sign-up that fails is a
   * sign-up the deployed pool really ran the function for.
   */
  const triggerSource =
    "exports.handler = async () => { throw new Error('Not today'); };";

  /**
   * The pool the events below put their triggers on, with the app client a
   * sign-up needs.
   */
  function poolResources(
    poolProperties: SimCfnTemplateValueRecord = {},
  ): SimCfnTemplateValueRecord {
    return {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users", ...poolProperties },
      },
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: { UserPoolId: { Ref: "AppPool" }, ClientName: "web" },
      },
    };
  }

  /**
   * A template whose function is a trigger of the pool beside it.
   */
  function template(properties: {
    readonly trigger: SimCfnTemplateValueRecord;
    readonly poolProperties?: SimCfnTemplateValueRecord;
  }): CfnTemplateBodyRecord {
    return {
      ...simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          FunctionName: "pre-signup",
          InlineCode: triggerSource,
          Events: {
            Signup: { Type: "Cognito", Properties: properties.trigger },
          },
        },
        resources: poolResources(properties.poolProperties),
      }),
      Outputs: {
        PoolId: { Value: { Ref: "AppPool" } },
        ClientId: { Value: { Ref: "AppClient" } },
      },
    };
  }

  async function deploy(
    simAws: SimAws,
    body: CfnTemplateBodyRecord,
  ): Promise<SimCfnDeployedStack> {
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "myapp-stack", template: body });
    await stack.waitForDeployComplete();

    return stack;
  }

  it("puts the function on the pool as the trigger the event names", async () => {
    // Given a SAM function whose Cognito event names a pool of the template
    // and the trigger it runs under
    const simAws = new SimAws();

    // When the template is deployed
    const stack = await deploy(
      simAws,
      template({
        trigger: { UserPool: { Ref: "AppPool" }, Trigger: "PreSignUp" },
      }),
    );

    // Then the deployed pool names the function in its LambdaConfig
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);

    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool({ input: { UserPoolId: userPoolId } });
    const preSignUp = described.UserPool?.LambdaConfig?.PreSignUp;
    assertTypeString(preSignUp);
    assertStringIncludes(preSignUp, ":function:pre-signup");

    // And a sign-up against that pool runs it, refusing in the handler's words
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cognitoIdentityProvider().signUp(
        new SignUpCommand({
          ClientId: clientId,
          Username: "ada",
          Password: "Correct-horse-1",
        }),
      ),
    );

    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "PreSignUp failed with error Not today",
    );
  });

  it("keeps the triggers the pool already declares", async () => {
    // Given a pool that already names a function for one trigger, and an event
    // adding a second
    const simAws = new SimAws();

    // When the template is deployed
    const stack = await deploy(
      simAws,
      template({
        trigger: { UserPool: "AppPool", Trigger: ["PostConfirmation"] },
        poolProperties: {
          LambdaConfig: { PreSignUp: { "Fn::GetAtt": ["Rates", "Arn"] } },
        },
      }),
    );

    // Then the pool carries both, rather than the event's replacing what the
    // template wrote by hand
    const userPoolId = stack.outputs.get("PoolId")?.value;
    assertTypeString(userPoolId);

    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool({ input: { UserPoolId: userPoolId } });

    assertTypeString(described.UserPool?.LambdaConfig?.PreSignUp);
    assertTypeString(described.UserPool.LambdaConfig.PostConfirmation);
  });

  it("leaves the function alone where the event names no pool", async () => {
    // Given a Cognito event that names a trigger but no user pool
    const simAws = new SimAws();

    // When the template is deployed
    const stack = await deploy(
      simAws,
      template({ trigger: { Trigger: "PreSignUp" } }),
    );

    // Then the pool deploys carrying no triggers at all, rather than the
    // deployment failing over an event nothing can read
    const userPoolId = stack.outputs.get("PoolId")?.value;
    assertTypeString(userPoolId);

    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool({ input: { UserPoolId: userPoolId } });

    assertUndefined(described.UserPool?.LambdaConfig);
  });

  it("fails the transform for a LambdaConfig it cannot add to", async () => {
    // Given a pool whose LambdaConfig is not a block of triggers at all
    const simAws = new SimAws();

    // When the template is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await deploy(
        simAws,
        template({
          trigger: { UserPool: "AppPool", Trigger: "PreSignUp" },
          poolProperties: { LambdaConfig: "PreSignUp" },
        }),
      );
    });

    // Then the pool is refused, rather than deploying with what it declared
    // quietly replaced
    assertStringIncludes(
      error.message,
      "Invalid Events.Signup.UserPool on AWS::Serverless::Function Resource " +
        "Rates",
    );
  });

  it("fails the transform for a trigger the pool already names", async () => {
    // Given a pool naming a function for the same trigger the event asks for
    const simAws = new SimAws();

    // When the template is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await deploy(
        simAws,
        template({
          trigger: { UserPool: "AppPool", Trigger: "PreSignUp" },
          poolProperties: {
            LambdaConfig: { PreSignUp: { "Fn::GetAtt": ["Rates", "Arn"] } },
          },
        }),
      );
    });

    // Then the deployment says which trigger was declared twice, rather than
    // silently running one of the two functions
    assertStringIncludes(
      error.message,
      "Invalid Events.Signup.Trigger on AWS::Serverless::Function Resource " +
        "Rates",
    );
    assertStringIncludes(error.message, "PreSignUp");
  });
});
