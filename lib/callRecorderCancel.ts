type CancelOutcome = "cancelled" | "receipt" | "unconfirmed";

/** Interpret the relay's response to cancellation while submitting. */
export function cancelOutcome(status: number): CancelOutcome {
  if (status === 409) return "receipt";
  return status >= 200 && status < 300 ? "cancelled" : "unconfirmed";
}
