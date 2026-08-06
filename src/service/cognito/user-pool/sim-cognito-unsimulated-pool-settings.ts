/**
 * The pool settings a request may set that this simulation does not act on.
 *
 * These are the ones `CreateUserPool` accepts at one value each, in the shape
 * a described pool reports them in.
 */
export interface SimCognitoUnsimulatedPoolSettingsType {
  readonly AccountRecoverySetting?: object | undefined;
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
    this.settings = this.accepted(settings);
  }

  /**
   * These settings as a described pool reports them.
   */
  toOutput(): SimCognitoUnsimulatedPoolSettingsType {
    return structuredClone(this.settings);
  }

  /**
   * The settings this holds, copied out of the request rather than kept by
   * reference.
   *
   * A caller passes its whole `CreateUserPool` input in, and may reuse or
   * edit that object afterwards. Two of these are nested objects, so the
   * copy goes all the way down. Copying means a described pool reports what
   * the request said at the time it was made, as a real one does.
   *
   * Each setting is kept only where the request set it, so a pool created
   * without one describes without it rather than describing it as the value
   * the request would have needed to use.
   */
  private accepted(
    settings: SimCognitoUnsimulatedPoolSettingsType,
  ): SimCognitoUnsimulatedPoolSettingsType {
    return structuredClone({
      ...(settings.AccountRecoverySetting !== undefined && {
        AccountRecoverySetting: settings.AccountRecoverySetting,
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
    });
  }
}
