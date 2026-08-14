import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoCustomDomainConfigType } from "../../user-pool/domain/sim-cognito-custom-domain-config.js";

/**
 * A user pool domain as sim Cognito describes it.
 *
 * `S3Bucket` and `Version` are not reported. Both name parts of the machinery
 * real Cognito builds a domain out of, and there is no such machinery here.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_DomainDescriptionType.html
 */
export interface SimCognitoDomainDescriptionType {
  readonly UserPoolId?: string | undefined;
  readonly AWSAccountId?: string | undefined;
  readonly Domain?: string | undefined;
  readonly CloudFrontDistribution?: string | undefined;
  readonly Status?: string | undefined;
  readonly CustomDomainConfig?: SimCognitoCustomDomainConfigType | undefined;
  readonly ManagedLoginVersion?: number | undefined;
}

/**
 * The CreateUserPoolDomain inputs this simulation reads, and the ones it
 * refuses.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateUserPoolDomain.html
 */
export interface SimCreateUserPoolDomainCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Domain?: string | undefined;
  readonly CustomDomainConfig?: SimCognitoCustomDomainConfigType | undefined;
  readonly ManagedLoginVersion?: number | undefined;
  readonly Routing?: object | undefined;
}

/**
 * Minimal structural sim Cognito CreateUserPoolDomain command.
 */
export interface SimCreateUserPoolDomainCommand {
  readonly input: SimCreateUserPoolDomainCommandInput;
}

export interface SimCreateUserPoolDomainCommandOutput {
  readonly CloudFrontDomain?: string | undefined;
  readonly ManagedLoginVersion?: number | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DescribeUserPoolDomain command, which names
 * the domain and no pool: a domain is unique across AWS, so it is enough on
 * its own.
 */
export interface SimDescribeUserPoolDomainCommand {
  readonly input: SimDescribeUserPoolDomainCommandInput;
}

export interface SimDescribeUserPoolDomainCommandInput {
  readonly Domain?: string | undefined;
}

export interface SimDescribeUserPoolDomainCommandOutput {
  readonly DomainDescription?: SimCognitoDomainDescriptionType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DeleteUserPoolDomain command.
 */
export interface SimDeleteUserPoolDomainCommand {
  readonly input: SimDeleteUserPoolDomainCommandInput;
}

export interface SimDeleteUserPoolDomainCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Domain?: string | undefined;
}

export interface SimDeleteUserPoolDomainCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
