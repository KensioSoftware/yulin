/**
 * The parts a Lambda@Edge test needs before it can say anything about a
 * function running: an execution role Lambda@Edge can assume, a function in
 * us-east-1, and a published version for the Behavior to name.
 *
 * These live under `test/` for the same reasons as the rest of
 * `test/cloudfront/`: eslint rejects an AWS SDK import from `src/` outside a
 * test file, and several suites need the same three steps.
 */

import { assertNonNullable } from "@kensio/smartass";
import {
  CreateDistributionCommand,
  type FunctionAssociation,
  type LambdaFunctionAssociation,
} from "@aws-sdk/client-cloudfront";
import {
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand } from "@aws-sdk/client-iam";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";
import { simCfSiteDistributionConfig } from "./site-fixture.js";

/**
 * The Region every Lambda@Edge function lives in.
 */
export const edgeRegion = "us-east-1";

/**
 * What a test asks for when it wants a function a Behavior can associate.
 */
export interface SimCfEdgeFunctionInput {
  readonly simAws: SimAws;
  readonly functionName: string;
  readonly handler: SimLambdaHandler;

  /**
   * The service principals the execution role trusts.
   *
   * A Lambda@Edge role trusts both `lambda.amazonaws.com` and
   * `edgelambda.amazonaws.com`. A test about the refusal names one of them.
   */
  readonly trustedServices?: readonly string[] | undefined;
}

/**
 * Create an execution role, a function in us-east-1 and a published version,
 * answering with the version ARN a Behavior names.
 */
export async function makeEdgeFunctionVersionArn(
  input: SimCfEdgeFunctionInput,
): Promise<string> {
  const { simAws, functionName, handler } = input;
  const edgeAws = simAws.region(edgeRegion);

  // IAM is Account scoped rather than Region scoped, so the role is created
  // through the simulation's own IAM wherever the function lives.
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: `${functionName}Role`,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: {
            Service: [
              ...(input.trustedServices ?? [
                "lambda.amazonaws.com",
                "edgelambda.amazonaws.com",
              ]),
            ],
          },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await edgeAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: role.Role.Arn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  const published = await edgeAws
    .lambda()
    .publishVersion(new PublishVersionCommand({ FunctionName: functionName }));

  assertNonNullable(
    published.FunctionArn,
    "PublishVersion answered with a version ARN",
  );

  return published.FunctionArn;
}

/**
 * The edge functions one cache Behavior associates, either kind.
 */
export interface SimCfBehaviorAssociations {
  readonly edge?: readonly LambdaFunctionAssociation[];
  readonly cff?: readonly FunctionAssociation[];
}

/**
 * Create a Distribution whose default Behavior carries these associations,
 * answering with its ID.
 *
 * The Origin and everything else about the Distribution are the site fixture's
 * own, so a test about an association states only the association.
 */
export async function createEdgeDistribution(
  simAws: SimAws,
  associations: SimCfBehaviorAssociations,
): Promise<string> {
  const created = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: simCfSiteDistributionConfig("edge-associations", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          ...(associations.cff !== undefined && {
            FunctionAssociations: {
              Quantity: associations.cff.length,
              Items: [...associations.cff],
            },
          }),
          ...(associations.edge !== undefined && {
            LambdaFunctionAssociations: {
              Quantity: associations.edge.length,
              Items: [...associations.edge],
            },
          }),
        },
      }),
    }),
  );

  assertNonNullable(created.Distribution?.Id, "the Distribution was created");

  return created.Distribution.Id;
}
