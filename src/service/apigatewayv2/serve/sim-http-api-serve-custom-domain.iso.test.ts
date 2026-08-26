import {
  CreateApiMappingCommand,
  CreateDomainNameCommand,
  DeleteApiCommand,
  DeleteDomainNameCommand,
  DeleteStageCommand,
  GetApiMappingsCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

const domainName = "api.example.test";

function localUrl(hostname: string, path: string): string {
  return new SimAwsLocalUrl({ input: `https://${hostname}${path}` }).toString();
}

/** A handler echoing its invocation event back, so a test can assert on it. */
const echoEvent = (event: SimPayload2Event): SimPayload2Event => event;

/**
 * Point a custom domain at an API, which is the domain and the mapping real
 * API Gateway needs before it serves anything under a name of its own.
 */
async function mapDomainTo(
  simAws: SimAws,
  api: SimHttpApi,
  apiMappingKey?: string,
  stage = "$default",
): Promise<void> {
  await simAws
    .apiGatewayV2()
    .createDomainName(new CreateDomainNameCommand({ DomainName: domainName }));
  await simAws.apiGatewayV2().createApiMapping(
    new CreateApiMappingCommand({
      DomainName: domainName,
      ApiId: api.apiId,
      Stage: stage,
      ApiMappingKey: apiMappingKey,
    }),
  );
}

describe("Serving a sim HTTP API on a custom domain name", () => {
  it("serves the API at the root of a domain mapped with an empty key", async () => {
    // Given an API mapped to the root of a custom domain
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets/{petId}"] },
      simAws,
    );
    await mapDomainTo(simAws, api);

    // When a request arrives on the domain's own hostname
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/pets/6"),
    );

    // Then the API's routes serve it, and the event names the domain the
    // client asked for rather than the endpoint API Gateway generated
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.routeKey, "GET /pets/{petId}");
    assertIdentical(event.rawPath, "/pets/6");
    assertIdentical(event.requestContext.domainName, domainName);
    assertIdentical(event.requestContext.domainPrefix, "api");
    assertIdentical(event.requestContext.apiId, api.apiId);
    expect(event.pathParameters).toStrictEqual({ petId: "6" });
  });

  it("serves the API under a non-empty base path", async () => {
    // Given an API mapped under a base path of a custom domain
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets/{petId}"] },
      simAws,
    );
    await mapDomainTo(simAws, api, "orders");

    // When a request arrives under that base path
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/orders/pets/6"),
    );

    // Then the base path is taken off before the routes see the path, and is
    // gone from the event too: AWS documents rawPath as not carrying the API
    // mapping value, and points a handler that needs it at payload format 1.0
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.routeKey, "GET /pets/{petId}");
    assertIdentical(event.rawPath, "/pets/6");
    assertIdentical(event.requestContext.http.path, "/pets/6");
    expect(event.pathParameters).toStrictEqual({ petId: "6" });
  });

  it("answers 404 under a base path the domain does not map", async () => {
    // Given a domain mapping only one base path
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets"] },
      simAws,
    );
    await mapDomainTo(simAws, api, "orders");

    // When a request arrives under another one
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/pets"),
    );

    // Then nothing serves it, since the domain has no root mapping
    assertIdentical(response.status, 404);
    expect(await response.json()).toStrictEqual({ message: "Not Found" });
  });

  it("serves the longest matching base path", async () => {
    // Given a domain mapping both its root and a base path, to two APIs
    const simAws = new SimAws();
    const root = await simHttpApiLambdaProxyFactory.make(
      { apiName: "site", functionName: "site", handler: () => "root" },
      simAws,
    );
    const orders = await simHttpApiLambdaProxyFactory.make(
      { apiName: "orders", functionName: "orders", handler: () => "orders" },
      simAws,
    );
    await mapDomainTo(simAws, root);
    await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: domainName,
        ApiId: orders.apiId,
        Stage: "$default",
        ApiMappingKey: "orders",
      }),
    );
    const http = new SimAwsHttp({ simAws });

    // When requests arrive under each of them
    const underRoot = await http.fetch(localUrl(domainName, "/pets"));
    const underOrders = await http.fetch(localUrl(domainName, "/orders/pets"));

    // Then the most specific base path wins, and the root mapping takes the
    // rest
    assertIdentical(await underRoot.json(), "root");
    assertIdentical(await underOrders.json(), "orders");
  });

  it("serves the stage the mapping names, without a stage segment", async () => {
    // Given an API whose only stage is a named one, mapped to a domain
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets"], stageNames: ["dev"] },
      simAws,
    );
    await mapDomainTo(simAws, api, undefined, "dev");

    // When a request arrives with no stage in its path
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/pets"),
    );

    // Then the mapping's stage serves it, since a mapping names its stage
    // rather than leaving it to the first path segment
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.requestContext.stage, "dev");
    assertIdentical(event.routeKey, "GET /pets");
  });

  it("stops resolving a deleted domain name", async () => {
    // Given an API served on a custom domain
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );
    await mapDomainTo(simAws, api);

    // When the domain is deleted
    await simAws
      .apiGatewayV2()
      .deleteDomainName(
        new DeleteDomainNameCommand({ DomainName: domainName }),
      );
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/pets"),
    );

    // Then its hostname names no simulated service at all any more
    assertIdentical(response.status, 501);
  });

  it("takes the mappings pointing at an API with the deleted API", async () => {
    // Given an API served on a custom domain
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );
    await mapDomainTo(simAws, api);

    // When the API is deleted
    await simAws
      .apiGatewayV2()
      .deleteApi(new DeleteApiCommand({ ApiId: api.apiId }));
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/pets"),
    );

    // Then the domain still answers and maps nothing, rather than holding a
    // base path pointing at an API that is gone
    const domain = simAws.apiGatewayV2().findDomainName(domainName);
    expect(domain?.apiMappings.list()).toStrictEqual([]);
    assertIdentical(response.status, 404);
  });

  it("answers 404 when no route of the mapped API matches", async () => {
    // Given an API mapped to a domain, serving one route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets"] },
      simAws,
    );
    await mapDomainTo(simAws, api);

    // When a request arrives for a path the API does not route
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/orders"),
    );

    // Then the domain answers the way the generated endpoint would
    assertIdentical(response.status, 404);
  });

  it("answers 404 when the stage a mapping names has been deleted", async () => {
    // Given an API mapped to a domain through its default stage
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets"] },
      simAws,
    );
    await mapDomainTo(simAws, api);

    // When that stage is deleted and the mapping is left pointing at it
    await simAws
      .apiGatewayV2()
      .deleteStage(
        new DeleteStageCommand({ ApiId: api.apiId, StageName: "$default" }),
      );
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/pets"),
    );

    // Then the mapping serves nothing, and the mapping itself stays, since
    // only DeleteApi takes mappings away
    assertIdentical(response.status, 404);
    const mappings = await simAws
      .apiGatewayV2()
      .getApiMappings(new GetApiMappingsCommand({ DomainName: domainName }));
    assertArrayLength(mappings.Items, 1);
  });

  it("keeps the mappings of the APIs a deleted API does not name", async () => {
    // Given a domain mapping two APIs under two base paths
    const simAws = new SimAws();
    const orders = await simHttpApiLambdaProxyFactory.make(
      { apiName: "orders", functionName: "orders", handler: echoEvent },
      simAws,
    );
    const pets = await simHttpApiLambdaProxyFactory.make(
      { apiName: "pets", functionName: "pets", handler: echoEvent },
      simAws,
    );
    await mapDomainTo(simAws, orders, "orders");
    await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: domainName,
        ApiId: pets.apiId,
        Stage: "$default",
        ApiMappingKey: "pets",
      }),
    );

    // When one of the two APIs is deleted
    await simAws
      .apiGatewayV2()
      .deleteApi(new DeleteApiCommand({ ApiId: orders.apiId }));

    // Then only its own mapping went with it
    const mappings = await simAws
      .apiGatewayV2()
      .getApiMappings(new GetApiMappingsCommand({ DomainName: domainName }));
    expect(
      mappings.Items.map((mapping) => mapping.ApiMappingKey),
    ).toStrictEqual(["pets"]);
  });

  it("reports the root path for a request to the base path itself", async () => {
    // Given an API mapped under a base path, routing the root
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /"] },
      simAws,
    );
    await mapDomainTo(simAws, api, "orders");

    // When the base path itself is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(domainName, "/orders"),
    );

    // Then the event reports the root, since taking the base path off leaves
    // no path at all
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.rawPath, "/");
    assertIdentical(event.routeKey, "GET /");
  });
});
