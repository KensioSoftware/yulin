import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertResponseStatus, describeResponse } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simAwsSourceIpHeaderName } from "../../iam/request/sim-aws-source-ip-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

const accountId = "888888888888";
const reporterArn = `arn:aws:iam::${accountId}:role/Reporter`;

describe("A sim HTTP API AWS_IAM route and aws:SourceIp", () => {
  it("admits a caller only from the address range its policy allows", async () => {
    // Given an AWS_IAM route, and a Role allowed to call it from one address
    // range
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        routeKeys: ["GET /orders"],
        handler: (): string => "orders",
      },
      simAws,
    );
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Reporter",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Reporter",
        PolicyName: "InvokeFromOffice",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "execute-api:Invoke",
            Resource: "*",
            Condition: { IpAddress: { "aws:SourceIp": "192.0.2.0/24" } },
          },
        }),
      }),
    );
    const url = new SimAwsLocalUrl({
      input: `${api.apiEndpoint}/orders`,
    }).toString();
    const http = new SimAwsHttp({ simAws });

    // When the Role calls it from inside the range and from loopback
    const inside = await http.fetch(url, {
      headers: {
        [simAwsCallerHeaderName]: reporterArn,
        [simAwsSourceIpHeaderName]: "192.0.2.10",
      },
    });
    const loopback = await http.fetch(url, {
      headers: { [simAwsCallerHeaderName]: reporterArn },
    });

    // Then only the call from inside the range is served
    assertResponseStatus(inside, 200, await describeResponse(inside));
    assertResponseStatus(loopback, 403, await describeResponse(loopback));
  });
});
