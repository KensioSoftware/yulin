import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimIamUser } from "../../../iam/user/sim-iam-user.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

async function deployConsoleUser(
  simAws: SimAws,
  password: string,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "console-stack",
    template: {
      Resources: {
        ConsoleUser: {
          Type: "AWS::IAM::User",
          Properties: {
            UserName: "ConsoleUser",
            LoginProfile: { Password: password },
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();

  return stack;
}

function consolePassword(stack: SimCfnDeployedStack): string {
  const user = stack.getResource("ConsoleUser")?.simResource as
    | SimIamUser
    | undefined;
  assertNonNullable(user?.loginProfile, "the deployed User's login profile");

  return user.loginProfile.password;
}

/**
 * The one record the Stack made about a dynamic reference.
 *
 * A Resource can record properties of its own alongside this, so the reference
 * is picked out by what its reason quotes.
 */
function dynamicReferenceRecord(stack: SimCfnDeployedStack): {
  path: string;
  reason: string;
} {
  const [ignored, ...rest] = stack.ignoredProperties.filter((property) =>
    property.reason.includes("{{resolve:"),
  );
  assertNonNullable(ignored, "a recorded dynamic reference");
  assertArrayEmpty(rest, "no second recorded dynamic reference");

  return { path: ignored.path, reason: ignored.reason };
}

describe("SSM CloudFormation ssm-secure dynamic references the simulation cannot answer", () => {
  it("deploys with a stand-in value where the parameter is absent", async () => {
    // Given nothing in Parameter Store.
    const simAws = simAwsInEuWest2();

    // When a template reads a parameter that was never created.
    const stack = await deployConsoleUser(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password}}",
    );

    // Then the Stack deploys and the Resource holds a stand-in value.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(
      consolePassword(stack),
      "dummy-value-for-/myapp/console-password",
    );

    // And the substitution is recorded against the property that held it.
    const ignored = dynamicReferenceRecord(stack);
    assertIdentical(ignored.path, "LoginProfile.Password");
    assertStringIncludes(ignored.reason, "/myapp/console-password");
    assertStringIncludes(ignored.reason, "stand-in value");
  });

  it("deploys with a stand-in value where the version is absent", async () => {
    // Given a SecureString parameter with one version.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Type: "SecureString",
        Value: "hunter2",
      },
    });

    // When a template names a version it has never had.
    const stack = await deployConsoleUser(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password:4}}",
    );

    // Then the Resource holds a stand-in value naming the missing version.
    assertIdentical(
      consolePassword(stack),
      "dummy-value-for-/myapp/console-password",
    );
    assertStringIncludes(dynamicReferenceRecord(stack).reason, "version 4");
  });

  it("deploys with a stand-in value where the reference names no parameter", async () => {
    // Given a reference whose body is empty.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await deployConsoleUser(simAws, "{{resolve:ssm-secure:}}");

    // Then it deploys, saying the body names no parameter.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(consolePassword(stack), "dummy-value-for-");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "parameter name",
    );
  });

  it("deploys with a stand-in value where the reference body is malformed", async () => {
    // Given a reference whose version is not an integer.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await deployConsoleUser(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password:latest}}",
    );

    // Then it deploys, saying the body was not a name and a version.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertStringIncludes(
      dynamicReferenceRecord(stack).reason,
      "integer version",
    );
  });
});
