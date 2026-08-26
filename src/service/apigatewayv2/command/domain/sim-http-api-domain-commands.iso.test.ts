import {
  CreateDomainNameCommand,
  DeleteDomainNameCommand,
  GetDomainNameCommand,
  GetDomainNamesCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { simAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2NotFound,
} from "../../error/sim-api-gateway-v2.error.js";

const certificateArn =
  "arn:aws:acm:eu-west-2:111111111111:certificate/6d2c7a2e-0c7a-4d4e-9b6c-1f0a2b3c4d5e";

describe("Sim API Gateway v2 custom domain name commands", () => {
  it("creates a custom domain name", async () => {
    // Given a simulated AWS with no domain names
    const simAws = new SimAws();

    // When a domain name is created
    const created = await simAws.apiGatewayV2().createDomainName(
      new CreateDomainNameCommand({
        DomainName: "api.example.test",
        DomainNameConfigurations: [
          { CertificateArn: certificateArn, EndpointType: "REGIONAL" },
        ],
      }),
    );

    // Then it reports the domain API Gateway would have made, selecting its
    // API mapping on the request base path
    assertIdentical(created.DomainName, "api.example.test");
    assertIdentical(created.ApiMappingSelectionExpression, "$request.basepath");
    expect(created.DomainNameConfigurations).toStrictEqual([
      { CertificateArn: certificateArn, EndpointType: "REGIONAL" },
    ]);
  });

  it("reads a domain name back and lists the domains of the scope", async () => {
    // Given two domain names
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "api.example.test" }),
      );
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "www.example.test" }),
      );

    // When they are read back
    const fetched = await simAws
      .apiGatewayV2()
      .getDomainName(
        new GetDomainNameCommand({ DomainName: "api.example.test" }),
      );
    const listed = await simAws
      .apiGatewayV2()
      .getDomainNames(new GetDomainNamesCommand({}));

    // Then both are there, with no configuration for one created without any
    assertIdentical(fetched.DomainName, "api.example.test");
    expect(fetched.DomainNameConfigurations).toStrictEqual([]);
    expect(listed.Items.map((domain) => domain.DomainName)).toStrictEqual([
      "api.example.test",
      "www.example.test",
    ]);
  });

  it("refuses a domain name another simulated Account already holds", async () => {
    // Given a domain name created in one Account
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "api.example.test" }),
      );

    // When another Account tries to create the same one
    // Then it is refused, because a custom domain name is unique across the
    // whole of AWS rather than within an Account
    await expect(
      simAws
        .accountRegionScope(simAwsAccountId("222222222222"))
        .apiGatewayV2()
        .createDomainName(
          new CreateDomainNameCommand({ DomainName: "api.example.test" }),
        ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses an edge-optimized domain name configuration", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When a domain name asks for the edge-optimized endpoint type
    // Then it is refused, since that is a REST API feature
    await expect(
      simAws.apiGatewayV2().createDomainName(
        new CreateDomainNameCommand({
          DomainName: "api.example.test",
          DomainNameConfigurations: [{ EndpointType: "EDGE" }],
        }),
      ),
    ).rejects.toThrow(/EndpointType 'EDGE' is not simulated/u);
  });

  it("refuses an option it does not simulate", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When a domain name is created with tags
    // Then they are refused by name rather than dropped
    await expect(
      simAws.apiGatewayV2().createDomainName(
        new CreateDomainNameCommand({
          DomainName: "api.example.test",
          Tags: { team: "orders" },
        }),
      ),
    ).rejects.toThrow(/CreateDomainName Tags is not simulated/u);
  });

  it("stops answering for a deleted domain name", async () => {
    // Given a domain name
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "api.example.test" }),
      );

    // When it is deleted
    await simAws
      .apiGatewayV2()
      .deleteDomainName(
        new DeleteDomainNameCommand({ DomainName: "api.example.test" }),
      );

    // Then nothing holds it any more, and its hostname resolves to nothing
    await expect(
      simAws
        .apiGatewayV2()
        .getDomainName(
          new GetDomainNameCommand({ DomainName: "api.example.test" }),
        ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
    expect(
      simAws.route53().resolveHttpHost("api.example.test"),
    ).toBeUndefined();
  });

  it("frees a deleted domain name for another Account to take", async () => {
    // Given a domain name created and then deleted
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "api.example.test" }),
      );
    await simAws
      .apiGatewayV2()
      .deleteDomainName(
        new DeleteDomainNameCommand({ DomainName: "api.example.test" }),
      );

    // When another Account creates it
    const created = await simAws
      .accountRegionScope(simAwsAccountId("222222222222"))
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "api.example.test" }),
      );

    // Then it is theirs, the way a released name is on real AWS
    assertIdentical(created.DomainName, "api.example.test");
  });

  it("refuses a hostname a Cognito hosted domain already answers on", async () => {
    // Given a Cognito user pool with a custom domain
    const simAws = new SimAws();
    const { UserPool } = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "customers" }));
    await simAws.cognitoIdentityProvider().createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: UserPool?.Id,
        Domain: "auth.example.test",
        CustomDomainConfig: { CertificateArn: certificateArn },
      }),
    );

    // When API Gateway is asked for the same hostname
    // Then it is refused, because a public hostname is unique across services
    // as well as across Accounts, as it is on real AWS
    await expect(
      simAws
        .apiGatewayV2()
        .createDomainName(
          new CreateDomainNameCommand({ DomainName: "auth.example.test" }),
        ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses a Cognito hosted domain on a hostname it already answers on", async () => {
    // Given an API Gateway custom domain
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "auth.example.test" }),
      );
    const { UserPool } = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "customers" }));

    // When Cognito is asked for the same hostname
    // Then it is refused too, so neither service can take the other's name
    await expect(
      simAws.cognitoIdentityProvider().createUserPoolDomain(
        new CreateUserPoolDomainCommand({
          UserPoolId: UserPool?.Id,
          Domain: "auth.example.test",
          CustomDomainConfig: { CertificateArn: certificateArn },
        }),
      ),
    ).rejects.toThrow(/already in use/u);
  });
});
