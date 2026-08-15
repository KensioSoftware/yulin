import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants a working version of the template
 * `origins.FunctionUrlOrigin.withOriginAccessControl()` synthesizes.
 *
 * Six Resources stand between a test and a Function URL served through a
 * Distribution, and each test about that shape is about one of them being
 * wrong, so each field here is one thing a template can get wrong on its own.
 */
export interface SimCfFunctionUrlOriginTemplateInput {
  /** How the origin access control signs, which is `always` in what CDK emits. */
  readonly signingBehavior: string;
  /**
   * Whether the Origin has an origin access control at all, since an Origin
   * without one is reached anonymously.
   */
  readonly originAccessControl: boolean;
  /**
   * Whether the template grants CloudFront the Function URL at all.
   */
  readonly permitted: boolean;
  /**
   * The actions the grant covers.
   *
   * Reaching a Function URL through an origin access control takes both of
   * them, so a template granting one is one that deploys and then answers 403.
   */
  readonly permittedActions: readonly string[];
  /** The Distribution the permission is granted for. */
  readonly permissionSourceArn: SimCfnTemplateValue;
}

/**
 * The parts of the template a template can leave out.
 *
 * Each is a Resource, or a property of one, that a template can forget. The
 * origin access control contributes two, which are both there or both absent,
 * since an Origin naming one nothing created would be refused rather than
 * reached. The permission contributes one Resource per action it grants.
 */
export interface SimCfFunctionUrlOriginParts {
  readonly originAccessControl: SimCfnTemplateValueRecord;
  readonly originAccessControlId: SimCfnTemplateValueRecord;
  readonly invokePermission: SimCfnTemplateValueRecord;
}

/**
 * Build the optional parts of a Function URL Origin template.
 */
export function simCfFunctionUrlOriginParts(
  input: SimCfFunctionUrlOriginTemplateInput,
): SimCfFunctionUrlOriginParts {
  return {
    originAccessControl: included(input.originAccessControl, {
      SiteOac: {
        Type: "AWS::CloudFront::OriginAccessControl",
        Properties: {
          OriginAccessControlConfig: {
            Name: "site-oac",
            OriginAccessControlOriginType: "lambda",
            SigningBehavior: input.signingBehavior,
            SigningProtocol: "sigv4",
          },
        },
      },
    }),
    originAccessControlId: included(input.originAccessControl, {
      OriginAccessControlId: { Ref: "SiteOac" },
    }),
    // The permissions letting CloudFront invoke the Function URL for this
    // Distribution alone. AWS takes one per action, and both of them.
    invokePermission: included(input.permitted, invokePermissions(input)),
  };
}

/**
 * One `AWS::Lambda::Permission` per granted action.
 *
 * The statement id is derived from the action, so a template granting both
 * carries two Resources rather than one overwriting the other, which is how
 * the two `aws lambda add-permission` calls in the AWS documentation land.
 */
function invokePermissions(
  input: SimCfFunctionUrlOriginTemplateInput,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    input.permittedActions.map((action) => [
      `${action.replace("lambda:", "")}FromCloudFront`,
      {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
          Action: action,
          Principal: "cloudfront.amazonaws.com",
          SourceArn: input.permissionSourceArn,
        },
      },
    ]),
  );
}

/**
 * One fragment of the template, or nothing where the template omits it.
 */
function included(
  present: boolean,
  fragment: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  if (!present) {
    return {};
  }

  return fragment;
}
