/**
 * The CloudFormation Resource types simulated WAFv2 creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice: once by the factory dispatching on it, and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const wafWebAclResourceType = "AWS::WAFv2::WebACL";

export const wafWebAclAssociationResourceType = "AWS::WAFv2::WebACLAssociation";

export const wafIpSetResourceType = "AWS::WAFv2::IPSet";

export const wafRegexPatternSetResourceType = "AWS::WAFv2::RegexPatternSet";

/** The type names the CloudFormation layer dispatches on, without a prefix. */
export const wafWebAclResourceTypeName = "WebACL";

export const wafWebAclAssociationResourceTypeName = "WebACLAssociation";

export const wafIpSetResourceTypeName = "IPSet";

export const wafRegexPatternSetResourceTypeName = "RegexPatternSet";
