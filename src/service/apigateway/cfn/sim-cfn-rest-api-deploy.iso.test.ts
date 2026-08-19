import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../aws/sim-aws-account.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import {
  simCfnRestApiMethodLogicalId,
  simCfnRestApiResourceLogicalId,
} from "./sim-cfn-rest-api-template-ids.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

/**
 * A handler reporting the resource path that served the request and the path
 * parameters it captured, so a test with several methods can tell them apart.
 */
const routeReportingHandler = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.httpMethod + " " + event.resource
    + " " + JSON.stringify(event.pathParameters ?? {}),
});
`;

function localUrl(apiUrl: string, path: string): string {
  return new SimAwsLocalUrl({ input: `${apiUrl}${path}` }).toString();
}

describe("API Gateway REST API CloudFormation deployment", () => {
  it("serves a request through a deployed API, resource and method", async () => {
    // Given a template declaring an API, a path tree, a method with its
    // integration, a deployment and a stage in front of a Lambda function
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        methods: [{ httpMethod: "GET", path: ["orders", "{orderId}"] }],
      }),
    );

    // When the deployed endpoint is requested
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiUrl, "orders/YL-1"),
    );

    // Then the request reached the integration's function through the method
    assertIdentical(response.status, 200);
    assertIdentical(
      await response.text(),
      'GET /orders/{orderId} {"orderId":"YL-1"}',
    );
  });

  it("serves the stage segment CDK builds the API's URL with", async () => {
    // Given a template whose stage is not the one CDK names by default
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        stageName: "live",
      }),
    );

    // When the URL the template published is requested
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiUrl, "orders"),
    );

    // Then the stage is a path segment of it, and the request was served
    assertTypeString(apiUrl);
    expect(apiUrl).toContain("/live/");
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "GET /orders {}");
  });

  it("hangs several methods off one path tree", async () => {
    // Given a template with methods on the root, on a shared node, and on a
    // node below it
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        methods: [
          { httpMethod: "GET", path: [] },
          { httpMethod: "GET", path: ["orders"] },
          { httpMethod: "POST", path: ["orders"] },
          { httpMethod: "GET", path: ["orders", "{orderId}"] },
        ],
      }),
    );
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const http = new SimAwsHttp({ simAws });

    // When each is requested
    const root = await http.fetch(localUrl(apiUrl, ""));
    const list = await http.fetch(localUrl(apiUrl, "orders"));
    const create = await http.fetch(localUrl(apiUrl, "orders"), {
      method: "POST",
    });
    const read = await http.fetch(localUrl(apiUrl, "orders/YL-1"));

    // Then each reaches the function through the method that matched it, and
    // the two methods on `/orders` share the one node
    assertIdentical(await root.text(), "GET / {}");
    assertIdentical(await list.text(), "GET /orders {}");
    assertIdentical(await create.text(), "POST /orders {}");
    assertIdentical(
      await read.text(),
      'GET /orders/{orderId} {"orderId":"YL-1"}',
    );
  });

  it("serves every verb through a greedy proxy method, as LambdaRestApi does", async () => {
    // Given the shape CDK's LambdaRestApi synthesizes: an ANY method on a
    // `{proxy+}` node and another on the root
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        methods: [
          { httpMethod: "ANY", path: [] },
          { httpMethod: "ANY", path: ["{proxy+}"] },
        ],
      }),
    );
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const http = new SimAwsHttp({ simAws });

    // When two verbs are sent to a path nothing declares
    const read = await http.fetch(localUrl(apiUrl, "orders/YL-1/items"));
    const write = await http.fetch(localUrl(apiUrl, "orders"), {
      method: "DELETE",
    });

    // Then the greedy method caught both, with the rest of the path captured
    assertIdentical(
      await read.text(),
      'GET /{proxy+} {"proxy":"orders/YL-1/items"}',
    );
    assertIdentical(await write.text(), 'DELETE /{proxy+} {"proxy":"orders"}');
  });

  it("answers Ref and Fn::GetAtt with the ids the API allocated", async () => {
    // Given a deployed API whose outputs read each value a template can take
    // off the Resources
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        outputs: {
          RestApiId: { Value: { "Fn::GetAtt": ["Api", "RestApiId"] } },
          RootResourceId: {
            Value: { "Fn::GetAtt": ["Api", "RootResourceId"] },
          },
          OrdersResourceId: {
            Value: {
              "Fn::GetAtt": [
                simCfnRestApiResourceLogicalId(["orders"]),
                "ResourceId",
              ],
            },
          },
          DeploymentId: {
            Value: { "Fn::GetAtt": ["Deployment", "DeploymentId"] },
          },
          StageName: { Value: { Ref: "Stage" } },
          MethodRef: {
            Value: {
              Ref: simCfnRestApiMethodLogicalId({
                httpMethod: "GET",
                path: ["orders"],
              }),
            },
          },
        },
      }),
    );

    // When the deployed API is read back
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    const restApi = simAws.apiGateway().findRestApi(apiId);
    assertNonNullable(restApi);

    // Then each output names what the API allocated
    assertIdentical(stack.outputs.get("RestApiId")?.value, apiId);
    assertIdentical(
      stack.outputs.get("RootResourceId")?.value,
      restApi.rootResource.resourceId,
    );
    assertIdentical(
      stack.outputs.get("OrdersResourceId")?.value,
      restApi.resources.findByPath("/orders")?.resourceId,
    );
    assertIdentical(
      stack.outputs.get("DeploymentId")?.value,
      stack.getResource("Deployment")?.refValue,
    );
    assertIdentical(stack.outputs.get("StageName")?.value, "prod");

    // And a method answers with its logical id, since a REST API method has no
    // id of its own and CloudFormation's own fallback is what answers
    assertIdentical(
      stack.outputs.get("MethodRef")?.value,
      simCfnRestApiMethodLogicalId({ httpMethod: "GET", path: ["orders"] }),
    );
  });

  it("carries the stage variables and descriptions the template gave", async () => {
    // Given a stage and a deployment declaring what they are for
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        apiProperties: { Description: "the orders API" },
        deploymentProperties: { Description: "deployed by the stack" },
        stageProperties: {
          Description: "the production stage",
          Variables: { catalogue: "v2" },
        },
      }),
    );

    // When the deployed API is read back
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    const restApi = simAws.apiGateway().findRestApi(apiId);
    const stage = restApi?.stages.find("prod");

    // Then each holds them, as one created by an SDK caller would
    assertNonNullable(restApi);
    assertNonNullable(stage);
    assertIdentical(restApi.description, "the orders API");
    assertIdentical(stage.description, "the production stage");
    expect(stage.variables).toStrictEqual({ catalogue: "v2" });
    assertIdentical(
      restApi.deployments.find(stage.deploymentId)?.description,
      "deployed by the stack",
    );
  });

  it("gates a deployed method with the IAM authorization it declares", async () => {
    // Given a template whose one method is authorized by IAM
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        methodProperties: { AuthorizationType: "AWS_IAM" },
      }),
    );

    // And a Role of the API's Account allowed to invoke that one method
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    const iam = simAws.iam();
    await iam.createRole(
      new CreateRoleCommand({
        RoleName: "Reporter",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: {
              AWS: `arn:aws:iam::${DEFAULT_SIM_AWS_ACCOUNT_ID}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await iam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Reporter",
        PolicyName: "InvokeOrders",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "execute-api:Invoke",
            Resource:
              `arn:aws:execute-api:eu-west-2:${DEFAULT_SIM_AWS_ACCOUNT_ID}:` +
              `${apiId}/prod/GET/orders`,
          },
        }),
      }),
    );

    // When the deployed endpoint is requested with and without that Role
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const http = new SimAwsHttp({ simAws });
    const anonymous = await http.fetch(localUrl(apiUrl, "orders"));
    const reporter = await http.fetch(localUrl(apiUrl, "orders"), {
      headers: {
        [simAwsCallerHeaderName]: `arn:aws:iam::${DEFAULT_SIM_AWS_ACCOUNT_ID}:role/Reporter`,
      },
    });

    // Then the template deployed a method IAM decides, closed to a request
    // carrying no identity and open to the Role that was allowed it
    assertIdentical(anonymous.status, 403);
    assertIdentical(reporter.status, 200);
    assertIdentical(await reporter.text(), "GET /orders {}");
  });

  it("refuses the generated endpoint when the API disables it", async () => {
    // Given an API deployed with the generated endpoint turned off
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        apiProperties: { DisableExecuteApiEndpoint: true },
      }),
    );

    // When the generated endpoint is requested
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiUrl, "orders"),
    );

    // Then it is refused rather than served
    assertIdentical(response.status, 403);
    expect(await response.json()).toStrictEqual({ message: "Forbidden" });
  });

  it("publishes a stage from a deployment that names one", async () => {
    // Given the older one-Resource form, where the deployment carries a stage
    // name of its own beside the AWS::ApiGateway::Stage the template declares
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        stageName: "live",
        deploymentProperties: { StageName: "prod" },
      }),
    );
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    const deploymentId = stack.getResource("Deployment")?.refValue;
    assertTypeString(deploymentId);

    // When the API is read back and both stages are requested
    const restApi = simAws.apiGateway().findRestApi(apiId);
    assertNonNullable(restApi);
    const http = new SimAwsHttp({ simAws });
    const fromDeploymentStage = await http.fetch(
      localUrl(restApi.invokeUrl("prod"), "/orders"),
    );
    const fromStageResource = await http.fetch(
      localUrl(restApi.invokeUrl("live"), "/orders"),
    );

    // Then the deployment published its own stage, and both serve the API
    assertIdentical(restApi.stages.find("prod")?.deploymentId, deploymentId);
    assertIdentical(restApi.stages.find("live")?.deploymentId, deploymentId);
    assertIdentical(await fromDeploymentStage.text(), "GET /orders {}");
    assertIdentical(await fromStageResource.text(), "GET /orders {}");
  });
});
