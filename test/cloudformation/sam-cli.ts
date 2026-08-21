/**
 * What the SAM expansion comparison runs against, and whether it runs at all.
 *
 * This lives under `test/` for the same reasons as `test/apigateway/`. Eslint
 * rejects a test file that exports helpers alongside its own `describe` calls,
 * and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import { assertNonNullable } from "@kensio/smartass";

import type { SimRestApi } from "../../src/service/apigateway/api/sim-rest-api.js";
import type { SimCfnDeployedStack } from "../../src/service/cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";
import { testSamCliVersion } from "../../src/util/filesystem/test-sam-project.js";

/**
 * The version of the AWS SAM CLI on the PATH, or nothing where the machine has
 * none.
 */
export const samCliVersion = await testSamCliVersion();

/**
 * Whether a comparison against real SAM can run here.
 *
 * The SAM CLI installs through pip, Homebrew or the AWS installer and has no
 * npm package, so a developer machine may be without it and the comparison
 * skips there. CI installs it before the local tests, and a CI run that cannot
 * find it fails below, because a test nobody ever runs is worse than no test.
 */
export const samCliMissing = samCliVersion === undefined;

if (samCliMissing && process.env["CI"] !== undefined) {
  throw new Error(
    "The AWS SAM CLI is not on the PATH. CI installs it before the local " +
      "tests run, so this is a workflow to fix rather than a test to skip.",
  );
}

if (samCliMissing) {
  // oxlint-disable-next-line no-console -- a skipped suite is worth saying out loud.
  console.warn(
    "Skipping the SAM CLI comparison: no `sam` on the PATH. Install the AWS " +
      "SAM CLI to run it, for example with `brew install aws-sam-cli`.",
  );
}

/**
 * A handler standing in for whatever a function does. The comparison is about
 * the APIs, stages and methods in front of it.
 */
const handlerSource = "exports.handler = async () => 'rates';";

/**
 * A template exercising every shape the REST half of SAM expands into: events
 * sharing the implicit API, two methods on one path, a method on the root, an
 * `any` method, and an event naming an `AWS::Serverless::Api` whose stage name
 * cannot be part of a logical ID.
 */
export const samRestApiTemplate: CfnTemplateBodyRecord = {
  Transform: "AWS::Serverless-2016-10-31",
  Resources: {
    Rates: {
      Type: "AWS::Serverless::Function",
      Properties: {
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        InlineCode: handlerSource,
        Events: {
          Get: {
            Type: "Api",
            Properties: { Path: "/rates/{currency}", Method: "GET" },
          },
          Post: {
            Type: "Api",
            Properties: { Path: "/rates/{currency}", Method: "POST" },
          },
          Any: { Type: "Api", Properties: { Path: "/fees", Method: "any" } },
          Root: { Type: "Api", Properties: { Path: "/", Method: "GET" } },
          Named: {
            Type: "Api",
            Properties: {
              RestApiId: { Ref: "RatesApi" },
              Path: "/named",
              Method: "POST",
            },
          },
        },
      },
    },
    RatesApi: {
      Type: "AWS::Serverless::Api",
      Properties: { StageName: "orders-dev" },
    },
  },
};

/**
 * Names in a settled order, so a comparison is about what is in each list.
 */
export function sortedNames(names: readonly string[]): string[] {
  return names.toSorted((left, right) => left.localeCompare(right));
}

/**
 * The stages a list of logical IDs holds, which is what the comparison checks
 * against the stages deployed here.
 */
export function stageLogicalIds(logicalIds: readonly string[]): string[] {
  return sortedNames(logicalIds.filter((name) => name.includes("Stage")));
}

/**
 * The methods one deployed API serves, as one `GET /rates/{currency}` per
 * method, which is the shape the SAM CLI reports its own in.
 */
export function servedMethods(
  stack: SimCfnDeployedStack,
  logicalId: string,
): string[] {
  const api = stack.getResource(logicalId)?.simResource as SimRestApi;
  assertNonNullable(api, `${logicalId} was not deployed as a REST API`);

  return sortedNames(
    api.resources
      .list()
      .flatMap((resource) =>
        resource
          .listMethods()
          .map((method) => `${method.httpMethod} ${resource.path}`),
      ),
  );
}
