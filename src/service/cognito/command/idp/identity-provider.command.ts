import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoAttributeMappingType } from "../../user-pool/idp/sim-cognito-attribute-mapping.js";
import type { SimCognitoProviderDetailsType } from "../../user-pool/idp/sim-cognito-provider-details.js";

/**
 * An identity provider as sim Cognito reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_IdentityProviderType.html
 */
export interface SimCognitoIdentityProviderType {
  readonly UserPoolId?: string | undefined;
  readonly ProviderName?: string | undefined;
  readonly ProviderType?: string | undefined;
  readonly ProviderDetails?: SimCognitoProviderDetailsType | undefined;
  readonly AttributeMapping?: SimCognitoAttributeMappingType | undefined;
  readonly IdpIdentifiers?: readonly string[] | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * An identity provider as `ListIdentityProviders` reports it, which is the
 * name and the type alone.
 */
export interface SimCognitoProviderDescription {
  readonly ProviderName?: string | undefined;
  readonly ProviderType?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * The CreateIdentityProvider inputs this simulation reads.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateIdentityProvider.html
 */
export interface SimCreateIdentityProviderCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ProviderName?: string | undefined;
  readonly ProviderType?: string | undefined;
  readonly ProviderDetails?: SimCognitoProviderDetailsType | undefined;
  readonly AttributeMapping?: SimCognitoAttributeMappingType | undefined;
  readonly IdpIdentifiers?: readonly string[] | undefined;
}

/**
 * Minimal structural sim Cognito CreateIdentityProvider command.
 */
export interface SimCreateIdentityProviderCommand {
  readonly input: SimCreateIdentityProviderCommandInput;
}

export interface SimCreateIdentityProviderCommandOutput {
  readonly IdentityProvider?: SimCognitoIdentityProviderType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DescribeIdentityProvider command.
 */
export interface SimDescribeIdentityProviderCommand {
  readonly input: SimDescribeIdentityProviderCommandInput;
}

export interface SimDescribeIdentityProviderCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ProviderName?: string | undefined;
}

export interface SimDescribeIdentityProviderCommandOutput {
  readonly IdentityProvider?: SimCognitoIdentityProviderType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The UpdateIdentityProvider inputs, which are the settings
 * `CreateIdentityProvider` takes against a provider that already exists. The
 * provider's type is not among them, because a provider cannot change what
 * kind of directory it stands for.
 */
export interface SimUpdateIdentityProviderCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ProviderName?: string | undefined;
  readonly ProviderDetails?: SimCognitoProviderDetailsType | undefined;
  readonly AttributeMapping?: SimCognitoAttributeMappingType | undefined;
  readonly IdpIdentifiers?: readonly string[] | undefined;
}

/**
 * Minimal structural sim Cognito UpdateIdentityProvider command.
 */
export interface SimUpdateIdentityProviderCommand {
  readonly input: SimUpdateIdentityProviderCommandInput;
}

export interface SimUpdateIdentityProviderCommandOutput {
  readonly IdentityProvider?: SimCognitoIdentityProviderType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DeleteIdentityProvider command.
 */
export interface SimDeleteIdentityProviderCommand {
  readonly input: SimDeleteIdentityProviderCommandInput;
}

export interface SimDeleteIdentityProviderCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ProviderName?: string | undefined;
}

export interface SimDeleteIdentityProviderCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito ListIdentityProviders command.
 */
export interface SimListIdentityProvidersCommand {
  readonly input: SimListIdentityProvidersCommandInput;
}

export interface SimListIdentityProvidersCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListIdentityProvidersCommandOutput {
  readonly Providers?: readonly SimCognitoProviderDescription[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
