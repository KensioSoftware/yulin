/**
 * Resource policy grants for a Function URL, which takes two actions.
 *
 * A Function URL takes `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`
 * both, and creating one through the API writes no permission, so every test
 * serving a URL it created that way grants the two first. This lives under
 * `test/` for the same reasons as the other fixtures here: eslint rejects a
 * test file that exports helpers, and more than one suite needs the steps.
 */

import {
  AddPermissionCommand,
  type AddPermissionCommandInput,
} from "@aws-sdk/client-lambda";

import type { SimLambda } from "../../src/service/lambda/sim-lambda.js";

/**
 * The parts of a URL grant the two statements share, plus the auth type the
 * URL statement is conditioned on.
 */
type SimFunctionUrlGrant = Pick<
  AddPermissionCommandInput,
  | "FunctionName"
  | "Qualifier"
  | "StatementId"
  | "Principal"
  | "SourceArn"
  | "SourceAccount"
  | "PrincipalOrgID"
  | "FunctionUrlAuthType"
>;

/**
 * Grant a principal a Function URL as the AWS CLI does it: the URL action in
 * one statement, and `lambda:InvokeFunction` in a second, restricted to calls
 * through a URL. The second statement's ID is the first's with `Invoke`
 * appended.
 */
export async function grantFunctionUrl(
  lambda: SimLambda,
  grant: SimFunctionUrlGrant,
): Promise<void> {
  const { FunctionUrlAuthType, StatementId, ...shared } = grant;

  await lambda.addPermission(
    new AddPermissionCommand({
      ...shared,
      StatementId,
      Action: "lambda:InvokeFunctionUrl",
      FunctionUrlAuthType,
    }),
  );
  await lambda.addPermission(
    new AddPermissionCommand({
      ...shared,
      StatementId: `${StatementId}Invoke`,
      Action: "lambda:InvokeFunction",
      InvokedViaFunctionUrl: true,
    }),
  );
}

/**
 * Grant everyone the two actions a `NONE` Function URL takes.
 *
 * Pass the qualifier for a URL on an alias, whose own resource policy decides
 * its requests.
 */
export async function grantPublicFunctionUrl(
  lambda: SimLambda,
  functionName: string,
  qualifier?: string,
): Promise<void> {
  await grantFunctionUrl(lambda, {
    FunctionName: functionName,
    Qualifier: qualifier,
    StatementId: "FunctionURLAllowPublicAccess",
    Principal: "*",
    FunctionUrlAuthType: "NONE",
  });
}
