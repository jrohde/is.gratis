/** Only same-site paths are allowed as a return address after logging in. */
export function safeNext(value: string | null, fallback: string): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : fallback;
}
