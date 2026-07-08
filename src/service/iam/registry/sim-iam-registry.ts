export interface SimIamDisableEvent {
  readonly reason: string;
  readonly detail?: string | undefined;
  readonly disabledAt: Date;
}

/**
 * Simulated IAM registry for state that is global within one SimAws instance.
 *
 * IAM service facades are Account-scoped, but IAM activation is sim AWS-wide so
 * cross-account behaviour does not depend on which Account first interacted
 * with sim IAM.
 */
export class SimIamRegistry {
  private activated = false;
  private disableEventRecord: SimIamDisableEvent | undefined;
  private readonly activationEventRecords: SimIamActivationEvent[] = [];

  /**
   * Whether sim IAM is currently activated for this sim AWS instance.
   */
  get isActivated(): boolean {
    return this.activated && this.disableEventRecord === undefined;
  }

  /**
   * Whether sim IAM has been explicitly and permanently disabled for this sim
   * AWS instance.
   */
  get isDisabled(): boolean {
    return this.disableEventRecord !== undefined;
  }

  /**
   * Recorded reasons why sim IAM activation was attempted.
   *
   * Events include both successful activations and later activation attempts that
   * were ignored because sim IAM had been permanently disabled.
   */
  get activationEvents(): SimIamActivationEvent[] {
    return this.activationEventRecords;
  }

  /**
   * The permanent disable event, if the user explicitly disabled sim IAM.
   */
  get disableEvent(): SimIamDisableEvent | undefined {
    return this.disableEventRecord;
  }

  /**
   * Human-readable diagnostic summary of why sim IAM is activated or not yet
   * activated.
   */
  get statusReason(): string {
    if (this.disableEventRecord !== undefined) {
      return `Sim IAM is permanently disabled: ${this.formatEventReason(
        this.disableEventRecord.reason,
        this.disableEventRecord.detail,
      )}`;
    }

    const latestActivationEvent = this.latestSuccessfulActivationEvent();

    if (latestActivationEvent !== undefined) {
      return `Sim IAM is activated: ${this.formatEventReason(
        latestActivationEvent.reason,
        latestActivationEvent.detail,
      )}`;
    }

    return "Sim IAM is not activated because it has not been activated.";
  }

  /**
   * Activate sim IAM for this simulated AWS instance.
   *
   * If sim IAM has previously been explicitly disabled, the activation attempt is
   * recorded for diagnostics but does not reactivate IAM semantics.
   */
  activate(reason = "Manual activation", detail?: string): void {
    const registryDisabled = this.disableEventRecord !== undefined;
    const ignoredReason = registryDisabled
      ? "Sim IAM was permanently disabled by explicit user action."
      : undefined;

    this.activationEventRecords.push({
      reason,
      detail,
      activatedAt: new Date(),
      activated: !registryDisabled,
      registryDisabled,
      ignoredReason,
    });

    if (!registryDisabled) {
      this.activated = true;
    }
  }

  /**
   * Disable IAM semantics for this simulated AWS instance.
   *
   * Disabling is permanent for the lifetime of this sim AWS instance. Automatic
   * activations from other simulated services are still recorded after disable,
   * but they are ignored.
   *
   * Disabling does not clear activation history because the history is useful
   * diagnostic information for tests and debugging.
   */
  disable(reason = "Manual disable", detail?: string): void {
    this.activated = false;

    this.disableEventRecord ??= {
      reason,
      detail,
      disabledAt: new Date(),
    };
  }

  private latestSuccessfulActivationEvent(): SimIamActivationEvent | undefined {
    return this.activationEventRecords.findLast((event) => event.activated);
  }

  private formatEventReason(reason: string, detail?: string): string {
    return detail === undefined ? reason : `${reason} (${detail})`;
  }
}

interface SimIamActivationEvent {
  readonly reason: string;
  readonly detail?: string | undefined;
  readonly activatedAt: Date;

  /**
   * Whether this activation attempt actually made sim IAM activated.
   *
   * This is false when the registry had previously been permanently disabled.
   */
  readonly activated: boolean;

  /**
   * Whether sim IAM had already been permanently disabled when this activation
   * was attempted.
   */
  readonly registryDisabled: boolean;

  /**
   * Diagnostic explanation when an activation attempt was recorded but ignored.
   */
  readonly ignoredReason?: string | undefined;
}
