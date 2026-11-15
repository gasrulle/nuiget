/** A reason from the host as the end of a sentence with one full stop (DS-COPY-3). */
export const sentence = (text: string): string => `${text.replace(/\.+$/, '')}.`;

/**
 * The one form of a read that failed (Design System §10 item 8; UX-P3.11, design-advisor opening ruling DO 3):
 * "<What> could not be <verb>: <reason>." with the host's reason as it wrote it (trimmed, its casing untouched, trailing
 * periods collapsed to one), or "<What> could not be <verb>." when there is no reason. `what` starts with "The".
 */
export function failure(what: string, verb: string, reason?: string): string {
    const told = reason?.trim().replace(/\.+$/, '') ?? '';
    return told === '' ? `${what} could not be ${verb}.` : `${what} could not be ${verb}: ${told}.`;
}
