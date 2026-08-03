import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import { assertFalse, assertNonNullable, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import { SimLambdaServiceInvokeAuthorizer } from "./sim-lambda-service-invoke-authorizer.js";

const bucketAccountId = "111111111111";
const s3ServicePrincipal = "s3.amazonaws.com";
const bucketArn = "arn:aws:s3:::orders";

/**
 * Create the function every case here authorizes against.
 */
async function createNotifier(simAws: SimAws): Promise<SimLambdaFunction> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "notify",
      Role: "arn:aws:iam::888888888888:role/NotifyRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "notified") },
    }),
  );
  const simFunction = simAws.lambda().getSimFunctionByName("notify");
  assertNonNullable(simFunction);

  return simFunction;
}

describe("Authorizing a simulated service to invoke a Lambda function", () => {
  it("refuses a service the function granted nothing", async () => {
    // Given a function with no resource policy at all
    const simAws = new SimAws();
    const simFunction = await createNotifier(simAws);

    // When a service asks to invoke it
    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: simAws.iam(),
    }).authorize({
      simFunction,
      servicePrincipal: s3ServicePrincipal,
      sourceArn: bucketArn,
      sourceAccount: bucketAccountId,
    });

    // Then nothing admits the call, since a service principal has no identity
    // policies of its own
    assertTrue(decision.isDenied);
  });

  it("allows a matching source Account", async () => {
    // Given a grant naming the Account the invoking resource belongs to, as
    // CDK writes for an S3 event notification
    const simAws = new SimAws();
    const simFunction = await createNotifier(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "notify",
        StatementId: "s3-invoke",
        Action: "lambda:InvokeFunction",
        Principal: s3ServicePrincipal,
        SourceAccount: bucketAccountId,
      }),
    );

    // When the service invokes it from that Account
    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: simAws.iam(),
    }).authorize({
      simFunction,
      servicePrincipal: s3ServicePrincipal,
      sourceArn: bucketArn,
      sourceAccount: bucketAccountId,
    });

    // Then the condition matches and the invoke is allowed
    assertTrue(decision.isAllowed);
  });

  it("refuses a different source Account", async () => {
    // Given a grant naming one Account
    const simAws = new SimAws();
    const simFunction = await createNotifier(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "notify",
        StatementId: "s3-invoke",
        Action: "lambda:InvokeFunction",
        Principal: s3ServicePrincipal,
        SourceAccount: bucketAccountId,
      }),
    );

    // When the invoking resource belongs to another one
    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: simAws.iam(),
    }).authorize({
      simFunction,
      servicePrincipal: s3ServicePrincipal,
      sourceArn: bucketArn,
      sourceAccount: "222222222222",
    });

    // Then the grant does not admit it, which is what a source Account is for:
    // another Account's Bucket cannot reach the function by naming its ARN
    assertTrue(decision.isDenied);
    assertFalse(decision.isAllowed);
  });

  it("requires both when the grant names an ARN and an Account", async () => {
    // Given a grant naming both, as CDK's LambdaDestination writes
    const simAws = new SimAws();
    const simFunction = await createNotifier(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "notify",
        StatementId: "s3-invoke",
        Action: "lambda:InvokeFunction",
        Principal: s3ServicePrincipal,
        SourceArn: bucketArn,
        SourceAccount: bucketAccountId,
      }),
    );
    const authorizer = new SimLambdaServiceInvokeAuthorizer({
      iam: simAws.iam(),
    });

    // When both match, and when only one of them does
    const both = authorizer.authorize({
      simFunction,
      servicePrincipal: s3ServicePrincipal,
      sourceArn: bucketArn,
      sourceAccount: bucketAccountId,
    });
    const otherBucket = authorizer.authorize({
      simFunction,
      servicePrincipal: s3ServicePrincipal,
      sourceArn: "arn:aws:s3:::refunds",
      sourceAccount: bucketAccountId,
    });

    // Then every condition on the statement has to hold
    assertTrue(both.isAllowed);
    assertTrue(otherBucket.isDenied);
  });

  it("refuses a conditioned grant when the service supplies no value", async () => {
    // Given a grant conditioned on a source Account
    const simAws = new SimAws();
    const simFunction = await createNotifier(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "notify",
        StatementId: "s3-invoke",
        Action: "lambda:InvokeFunction",
        Principal: s3ServicePrincipal,
        SourceAccount: bucketAccountId,
      }),
    );

    // When the invoking service knows of no source Account to supply
    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: simAws.iam(),
    }).authorize({
      simFunction,
      servicePrincipal: s3ServicePrincipal,
    });

    // Then the missing key fails the condition rather than passing it
    assertTrue(decision.isDenied);
  });

  it("refuses a grant made to a different service principal", async () => {
    // Given a grant to one service
    const simAws = new SimAws();
    const simFunction = await createNotifier(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "notify",
        StatementId: "s3-invoke",
        Action: "lambda:InvokeFunction",
        Principal: s3ServicePrincipal,
        SourceAccount: bucketAccountId,
      }),
    );

    // When another service invokes the function from the same Account
    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: simAws.iam(),
    }).authorize({
      simFunction,
      servicePrincipal: "events.amazonaws.com",
      sourceAccount: bucketAccountId,
    });

    // Then the principal of the statement decides, not the condition
    assertTrue(decision.isDenied);
  });
});
