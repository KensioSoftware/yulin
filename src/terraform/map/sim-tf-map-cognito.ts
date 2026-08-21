/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import {
  properties,
  renamed,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";
import {
  userPoolPolicies,
  userPoolSchema,
  userPoolTags,
} from "./sim-tf-map-cognito-pool.js";

/**
 * A user pool.
 *
 * `UserPoolTags` is CloudFormation's name for a pool's tags, and unlike almost
 * everywhere else it is a map rather than a list of key and value pairs.
 * Simulated Cognito records every property it does not model against the
 * Resource rather than refusing it, so the pool deploys and says what it is
 * not doing.
 */
export function cognitoUserPool(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::Cognito::UserPool",
    Properties: {
      ...renamed(context, {
        UserPoolName: "name",
        MfaConfiguration: "mfa_configuration",
        DeletionProtection: "deletion_protection",
        AutoVerifiedAttributes: "auto_verified_attributes",
        UsernameAttributes: "username_attributes",
        AliasAttributes: "alias_attributes",
        SmsAuthenticationMessage: "sms_authentication_message",
      }),
      ...properties({
        Policies: userPoolPolicies(context),
        Schema: userPoolSchema(context),
        UserPoolTags: userPoolTags(context),
      }),
    },
  };
}
