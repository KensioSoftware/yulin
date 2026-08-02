/**
 * The pool settings a request may set that this simulation does not act on.
 *
 * These are the ones `CreateUserPool` accepts at one value each, in the shape
 * a described pool reports them in.
 */
export interface SimCognitoUnsimulatedPoolSettingsType {
  readonly AccountRecoverySetting?: object | undefined;
  readonly AdminCreateUserConfig?: object | undefined;
  readonly EmailVerificationMessage?: string | undefined;
  readonly EmailVerificationSubject?: string | undefined;
  readonly SmsVerificationMessage?: string | undefined;
  readonly VerificationMessageTemplate?: object | undefined;
}

/**
 * The settings a pool was created with and this simulation does not act on.
 *
 * Each one configures message delivery or account recovery, and neither is
 * simulated, so nothing reads any of them back out. They are kept so
 * `DescribeUserPool` reports what the request set, which is how a test can
 * see that a template's declaration reached the pool rather than being
 * dropped on the way.
 *
 * Only what the request set is reported. A pool created without one of these
 * describes without it, rather than describing it as the value the request
 * would have needed to use.
 */
export class SimCognitoUnsimulatedPoolSettings {
  private readonly settings: SimCognitoUnsimulatedPoolSettingsType;

  constructor(settings: SimCognitoUnsimulatedPoolSettingsType) {
    this.settings = settings;
  }

  /**
   * These settings as a described pool reports them.
   *
   * Each one appears only where the request set it, so a described pool
   * carries what was asked for and nothing more.
   */
  toOutput(): SimCognitoUnsimulatedPoolSettingsType {
    const settings = this.settings;

    return {
      ...(settings.AccountRecoverySetting !== undefined && {
        AccountRecoverySetting: settings.AccountRecoverySetting,
      }),
      ...(settings.AdminCreateUserConfig !== undefined && {
        AdminCreateUserConfig: settings.AdminCreateUserConfig,
      }),
      ...(settings.EmailVerificationMessage !== undefined && {
        EmailVerificationMessage: settings.EmailVerificationMessage,
      }),
      ...(settings.EmailVerificationSubject !== undefined && {
        EmailVerificationSubject: settings.EmailVerificationSubject,
      }),
      ...(settings.SmsVerificationMessage !== undefined && {
        SmsVerificationMessage: settings.SmsVerificationMessage,
      }),
      ...(settings.VerificationMessageTemplate !== undefined && {
        VerificationMessageTemplate: settings.VerificationMessageTemplate,
      }),
    };
  }
}
