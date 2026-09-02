import { assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  samAuthRefusal,
  samLambdaAuthorizer,
} from "../../../../../../test/cloudformation/sam-auth-refusal.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";

/**
 * One malformed `Auth` block, and the fragment the refusal has to name.
 */
type RefusalCase = readonly [SimCfnTemplateValue, string];

describe("SAM API Auth refusals", () => {
  it("refuses a REST API Auth block it cannot read", () => {
    // Given Auth blocks written as something other than the shapes SAM states.
    // A string in place of the block, of the authorizer map and of one
    // authorizer, an authorizer naming nothing to decide with, a
    // DefaultAuthorizer that is not a name, and a payload type that is neither
    // of the two
    const cases: readonly RefusalCase[] = [
      ["closed", "Invalid Auth on AWS::Serverless::Api Resource Orders"],
      [{ Authorizers: "PoolAuth" }, "Auth.Authorizers"],
      [{ Authorizers: { PoolAuth: "pool" } }, "Auth.Authorizers.PoolAuth"],
      [
        { Authorizers: { PoolAuth: {} } },
        "names neither a UserPoolArn nor a FunctionArn",
      ],
      [{ DefaultAuthorizer: ["PoolAuth"] }, "Auth.DefaultAuthorizer"],
      [
        samLambdaAuthorizer({ FunctionPayloadType: "COOKIE" }),
        "FunctionPayloadType",
      ],
    ];

    // When each is expanded
    // Then the property is named, and the API never deploys without it
    for (const [auth, expected] of cases) {
      assertStringIncludes(samAuthRefusal("Api", auth), expected);
    }
  });

  it("refuses an authorizer Identity it cannot read", () => {
    // Given identity blocks written as a string, naming a check that is not
    // simulated, holding a name list that is not a list, and naming a request
    // part as something other than a string
    const cases: readonly RefusalCase[] = [
      ["header", "Identity"],
      [{ ValidationExpression: "^Bearer " }, "Identity.ValidationExpression"],
      [{ Headers: "X-Tenant" }, "Identity.Headers"],
      [{ Headers: [7] }, "Identity.Headers"],
    ];

    // When each is expanded
    // Then the level of the block that was wrong is named
    for (const [identity, expected] of cases) {
      const auth = samLambdaAuthorizer({ Identity: identity });

      assertStringIncludes(samAuthRefusal("Api", auth), expected);
    }
  });

  it("refuses an HTTP API authorizer it cannot read", () => {
    // Given an authorizer naming nothing to decide with, and one whose JWT
    // configuration is not a block
    const cases: readonly RefusalCase[] = [
      [
        { Authorizers: { PoolAuth: {} } },
        "names neither a JwtConfiguration nor a FunctionArn",
      ],
      [
        { Authorizers: { PoolAuth: { JwtConfiguration: "issuer" } } },
        "Auth.Authorizers.PoolAuth.JwtConfiguration",
      ],
    ];

    // When each is expanded
    // Then the property is named
    for (const [auth, expected] of cases) {
      assertStringIncludes(samAuthRefusal("HttpApi", auth), expected);
    }
  });

  it("refuses an event Auth block it cannot read", () => {
    // Given an event whose Auth is a string, one asking for an API key, and
    // one naming its authorizer as something other than a name
    const cases: readonly RefusalCase[] = [
      ["closed", "Invalid Events.Get.Auth on AWS::Serverless::Function"],
      [{ ApiKeyRequired: true }, "Events.Get.Auth.ApiKeyRequired"],
      [{ Authorizer: ["PoolAuth"] }, "Events.Get.Auth.Authorizer"],
    ];

    // When each is expanded
    // Then the event is named, and the method never deploys open
    for (const [eventAuth, expected] of cases) {
      assertStringIncludes(samAuthRefusal("Api", {}, eventAuth), expected);
    }
  });
});
