/**
 * A Distribution whose Origins are simulated Lambda Function URLs, for tests
 * about the Lambda@Edge functions running either side of the Origin fetch.
 *
 * A custom Origin is what an origin event has the most to say about. It is the
 * kind whose domain name, path and custom headers a handler can rewrite, and
 * the kind that can answer with a status of its own. This lives under `test/`
 * for the same reasons as the rest of `test/cloudfront/`. Eslint rejects an
 * AWS SDK import from `src/` outside a test file, and more than one suite needs
 * the same steps.
 */

import { assertNonNullable } from "@kensio/smartass";
import {
  CreateDistributionCommand,
  type LambdaFunctionAssociation,
  type Origin,
} from "@aws-sdk/client-cloudfront";
import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAwsHttp } from "../../src/serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../src/serve/http/url/sim-aws-local-url.js";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";

/**
 * Create a public Function URL served by this handler, and answer with the
 * hostname a custom Origin reaches it on.
 */
export async function functionUrlHostname(
  simAws: SimAws,
  functionName: string,
  handler: SimLambdaHandler,
): Promise<string> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: "arn:aws:iam::111111111111:role/OriginRole",
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  const { FunctionUrl: functionUrl } = await simAws
    .lambda()
    .createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: functionName,
        AuthType: "NONE",
      }),
    );
  assertNonNullable(functionUrl, "the Function URL was created");

  return new URL(functionUrl).hostname;
}

/**
 * A handler answering with a fixed status and body, for an Origin a test only
 * needs to tell apart from another one.
 */
export function respondingWith(
  body: string,
  statusCode = 200,
): SimLambdaHandler {
  return () => ({
    statusCode,
    headers: { "content-type": "text/plain" },
    body,
  });
}

/**
 * A custom Origin reaching the given hostname.
 */
export function customOrigin(originId: string, domainName: string): Origin {
  return {
    Id: originId,
    DomainName: domainName,
    CustomOriginConfig: {
      HTTPPort: 80,
      HTTPSPort: 443,
      OriginProtocolPolicy: "https-only",
    },
  };
}

/**
 * Create a Distribution serving these Origins, whose default Behavior targets
 * the first one and runs these edge functions. Answers with the hostname a
 * viewer reaches it on.
 */
export async function edgeOriginDistributionHostname(
  simAws: SimAws,
  origins: readonly Origin[],
  associations: readonly LambdaFunctionAssociation[],
): Promise<string> {
  const [targetOrigin] = origins;
  assertNonNullable(targetOrigin, "the Distribution has an Origin");

  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "edge-origin",
        Comment: "Custom Origin CDN",
        Enabled: true,
        Origins: { Quantity: origins.length, Items: [...origins] },
        DefaultCacheBehavior: {
          TargetOriginId: targetOrigin.Id,
          ViewerProtocolPolicy: "allow-all",
          LambdaFunctionAssociations: {
            Quantity: associations.length,
            Items: [...associations],
          },
        },
      },
    }),
  );

  const distroHostname = creation.Distribution?.DomainName;
  assertNonNullable(distroHostname, "the Distribution was created");

  return distroHostname;
}

/**
 * Fetch a path through the Distribution as a viewer would.
 */
export async function edgeOriginViewerFetch(
  simAws: SimAws,
  distroHostname: string,
  path: string,
): Promise<Response> {
  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `https://${distroHostname}${path}`,
    }).toString(),
  );
}
