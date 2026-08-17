/**
 * The CloudFormation Resource types simulated SES creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice: once by the factory dispatching on it, and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const sesEmailIdentityResourceType = "AWS::SES::EmailIdentity";

export const sesTemplateResourceType = "AWS::SES::Template";

/** The type name the CloudFormation layer dispatches on, without its prefix. */
export const sesEmailIdentityResourceTypeName = "EmailIdentity";

export const sesTemplateResourceTypeName = "Template";
