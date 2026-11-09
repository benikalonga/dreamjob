/** Turns free text into a safe full-text query: every word must match, as a prefix. */
export function toFtsQuery(text: string): string | null {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!words?.length) return null;
  return words.slice(0, 8).map((w) => `"${w}"*`).join(' ');
}
