import { MappedFactory } from "@kensio/part-factory";

import type { JSONObject } from "../../../util/type-guard/json.js";

/**
 * What a test asks for when it wants an operation's integration.
 */
export interface SimHttpApiOpenApiIntegrationInput {
  readonly functionArn: string;
  readonly regionName: string;
}

/**
 * Builds the `x-amazon-apigateway-integration` extension an operation carries,
 * with the long URI form an imported document writes.
 *
 * ```typescript
 * const integration = simHttpApiOpenApiIntegrationFactory.make({ functionArn });
 * ```
 */
export const simHttpApiOpenApiIntegrationFactory = new MappedFactory<
  SimHttpApiOpenApiIntegrationInput,
  JSONObject
>(
  () => ({
    functionArn: "arn:aws:lambda:us-east-1:111111111111:function:orders",
    regionName: "us-east-1",
  }),
  (input) => ({
    type: "aws_proxy",
    httpMethod: "POST",
    uri:
      `arn:aws:apigateway:${input.regionName}:lambda:path/2015-03-31` +
      `/functions/${input.functionArn}/invocations`,
    payloadFormatVersion: "2.0",
  }),
);
