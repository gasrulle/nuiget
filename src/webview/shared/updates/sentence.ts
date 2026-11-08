/** A reason from the host as the end of a sentence with one full stop (DS-COPY-3). */
export const sentence = (text: string): string => `${text.replace(/\.+$/, '')}.`;
