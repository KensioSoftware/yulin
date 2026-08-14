import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployFailure,
  deploySuccess,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * A pool, a domain and a Google provider, which is what a stack signing users
 * in with Google declares.
 */
const federatedResources: SimCfnTemplateValueRecord = {
  AppPool: {
    Type: "AWS::Cognito::UserPool",
    Properties: { UserPoolName: "myapp-users" },
  },
  AppDomain: {
    Type: "AWS::Cognito::UserPoolDomain",
    Properties: { UserPoolId: { Ref: "AppPool" }, Domain: "myapp-login" },
  },
  GoogleProvider: {
    Type: "AWS::Cognito::UserPoolIdentityProvider",
    Properties: {
      UserPoolId: { Ref: "AppPool" },
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: {
        client_id: "google-client-id",
        client_secret: "google-client-secret",
        authorize_scopes: "openid email",
      },
      AttributeMapping: { email: "email" },
      IdpIdentifiers: ["example.com"],
    },
  },
};

const federatedOutputs: SimCfnTemplateValueRecord = {
  DomainName: { Value: { Ref: "AppDomain" } },
  ProviderName: { Value: { Ref: "GoogleProvider" } },
};

function deployedCognito(
  simAws: SimAws,
): ReturnType<SimAws["cognitoIdentityProvider"]> {
  return simAws.cognitoIdentityProvider();
}

describe("Cognito federation from CloudFormation", () => {
  it("deploys a domain and an identity provider", async () => {
    // Given a template declaring a pool, a domain and a Google provider.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(
      simAws,
      federatedResources,
      federatedOutputs,
    );

    // Then the domain answers on its Cognito hostname, and the pool holds the
    // provider the template configured.
    const cognito = deployedCognito(simAws);
    const domain = cognito.findUserPoolDomainInAnyAccount("myapp-login");
    assertNonNullable(domain);
    assertIdentical(
      domain.hostname,
      "myapp-login.auth.eu-west-2.amazoncognito.com",
    );

    const pool = cognito.userPool(domain.userPoolId);
    const provider = pool.auth.identityProviders.require("Google");
    assertIdentical(provider.type.value, "Google");
    assertIdentical(provider.details.value("client_id"), "google-client-id");

    // And `Ref` on each returns what names it: the domain string, and the
    // provider name.
    assertIdentical(stack.outputs.get("DomainName")?.value, "myapp-login");
    assertIdentical(stack.outputs.get("ProviderName")?.value, "Google");
  });

  it("publishes the CloudFront distribution of a custom domain", async () => {
    // Given a template declaring a custom domain.
    const simAws = simAwsInEuWest2();

    // When it is deployed with an output reading its distribution.
    const stack = await deploySuccess(
      simAws,
      {
        AppPool: {
          Type: "AWS::Cognito::UserPool",
          Properties: { UserPoolName: "myapp-users" },
        },
        AppDomain: {
          Type: "AWS::Cognito::UserPoolDomain",
          Properties: {
            UserPoolId: { Ref: "AppPool" },
            Domain: "auth.example.com",
            CustomDomainConfig: {
              CertificateArn:
                "arn:aws:acm:us-east-1:888888888888:certificate/a1b2c3d4",
            },
          },
        },
      },
      {
        Distribution: {
          Value: { "Fn::GetAtt": ["AppDomain", "CloudFrontDistribution"] },
        },
      },
    );

    // Then the distribution name comes back, which is what a template points
    // its own DNS at on real AWS.
    assertStringIncludes(
      JSON.stringify(stack.outputs.get("Distribution")?.value),
      "cloudfront.net",
    );
  });

  it("takes the domain and the provider away with the stack", async () => {
    // Given a deployed stack with a domain and a provider.
    const simAws = simAwsInEuWest2();
    const stack = await deploySuccess(simAws, federatedResources);

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack({ input: { StackName: "app-stack" } });
    await stack.waitForDeleteComplete();

    // Then the domain no longer resolves, so its name is free for another
    // pool.
    assertUndefined(
      deployedCognito(simAws).findUserPoolDomainInAnyAccount("myapp-login"),
    );
  });

  it("refuses an Fn::GetAtt attribute the new types do not publish", async () => {
    // Given a stack with a prefix domain and a provider, whose Output reads an
    // attribute neither of them answers.
    const attributeFailure = async (
      logicalId: string,
      attribute: string,
    ): Promise<Error> =>
      deployFailure(simAwsInEuWest2(), federatedResources, {
        Attribute: { Value: { "Fn::GetAtt": [logicalId, attribute] } },
      });

    // When one is deployed for each.
    const domainError = await attributeFailure("AppDomain", "Domain");
    const providerError = await attributeFailure("GoogleProvider", "Arn");

    // Then each refusal names the Resource type and the attribute.
    assertStringIncludes(
      domainError.message,
      "Unsupported AWS::Cognito::UserPoolDomain attribute Domain",
    );
    assertStringIncludes(
      providerError.message,
      "Unsupported AWS::Cognito::UserPoolIdentityProvider attribute Arn",
    );
  });

  it("publishes an empty distribution for a prefix domain", async () => {
    // Given a stack with a prefix domain, which has no CloudFront
    // distribution in front of it.
    const simAws = simAwsInEuWest2();

    // When its distribution attribute is read.
    const stack = await deploySuccess(simAws, federatedResources, {
      Distribution: {
        Value: { "Fn::GetAtt": ["AppDomain", "CloudFrontDistribution"] },
      },
    });

    // Then it is empty rather than naming one nothing here serves.
    assertIdentical(stack.outputs.get("Distribution")?.value, "");
  });

  it("refuses a provider the Cognito API refuses", async () => {
    // Given a template declaring a Google provider with no credentials.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users" },
      },
      GoogleProvider: {
        Type: "AWS::Cognito::UserPoolIdentityProvider",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ProviderName: "Google",
          ProviderType: "Google",
          ProviderDetails: { client_id: "google-client-id" },
        },
      },
    });

    // Then the refusal is the API's own, with the logical ID in front of it.
    assertStringIncludes(error.message, "GoogleProvider");
    assertStringIncludes(error.message, "ProviderDetails is missing");
  });
});
