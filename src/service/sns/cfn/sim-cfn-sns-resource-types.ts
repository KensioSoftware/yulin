/**
 * The CloudFormation Resource types simulated SNS creates.
 *
 * They are named here rather than spelled out where they are used, because each
 * one is written twice: once by the factory dispatching on it, and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const snsTopicResourceType = "AWS::SNS::Topic";

export const snsSubscriptionResourceType = "AWS::SNS::Subscription";

export const snsTopicPolicyResourceType = "AWS::SNS::TopicPolicy";
