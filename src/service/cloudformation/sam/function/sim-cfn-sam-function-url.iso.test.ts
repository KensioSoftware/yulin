import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaFunctionUrl } from "../../../lambda/function/url/sim-lambda-function-url.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "./sim-cfn-sam-function-template.factory.js";

describe("SAM function FunctionUrlConfig expansion", () => {
  it("serves the function on the URL its config asked for", async () => {
    // Given a SAM function declaring a Function URL open to anyone
    const simAws = new SimAws();

    // When it is deployed with a handler bound to it
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-url-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          FunctionUrlConfig: { AuthType: "NONE", InvokeMode: "BUFFERED" },
        },
      }),
      bindings: [
        {
          logicalId: samFunctionTemplateLogicalId,
          handler: (request: { rawPath: string }) => ({
            statusCode: 200,
            body: `rates at ${request.rawPath}`,
          }),
        },
      ],
    });

    // Then the Stack holds a Function URL named after the function
    const urlResource = stack.getResource(`${samFunctionTemplateLogicalId}Url`);
    assertNonNullable(urlResource);
    assertIdentical(urlResource.type, "AWS::Lambda::Url");

    const functionUrl = urlResource.simResource;
    assertInstanceOf(functionUrl, SimLambdaFunctionUrl);
    assertIdentical(functionUrl.invokeMode, "BUFFERED");
    assertArrayEmpty(stack.skippedResources);

    // And a request to it runs the bound handler
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${functionUrl.url}rates` }).toString(),
    );

    assertIdentical(await response.text(), "rates at /rates");
  });

  it("carries the config's CORS settings over to the URL", async () => {
    // Given a SAM function whose Function URL config allows one Origin
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-cors-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          FunctionUrlConfig: {
            AuthType: "NONE",
            Cors: {
              AllowOrigins: ["https://rates.example.com"],
              AllowMethods: ["GET"],
              MaxAge: 300,
            },
          },
        },
      }),
    });

    // Then the expanded Function URL holds them
    const functionUrl = stack.getResource(
      `${samFunctionTemplateLogicalId}Url`,
    )?.simResource;
    assertInstanceOf(functionUrl, SimLambdaFunctionUrl);
    assertObjectEquals(functionUrl.cors, {
      AllowOrigins: ["https://rates.example.com"],
      AllowMethods: ["GET"],
      MaxAge: 300,
    });
  });

  it("leaves a function stating no URL config without one", async () => {
    // Given a SAM function saying nothing about a Function URL
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-no-url-stack",
      template: simCfnSamFunctionTemplateFactory.make({}),
    });

    // Then nothing was expanded to serve it
    assertUndefined(stack.getResource(`${samFunctionTemplateLogicalId}Url`));
  });
});
