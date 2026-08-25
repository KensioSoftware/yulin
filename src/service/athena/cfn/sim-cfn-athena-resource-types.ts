/**
 * The CloudFormation Resource types simulated Athena creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice: once by the factory dispatching on it, and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const athenaWorkGroupResourceType = "AWS::Athena::WorkGroup";

export const athenaNamedQueryResourceType = "AWS::Athena::NamedQuery";

/** The type name the CloudFormation layer dispatches on, without its prefix. */
export const athenaWorkGroupResourceTypeName = "WorkGroup";

export const athenaNamedQueryResourceTypeName = "NamedQuery";
