const BACKSLASH = String.fromCharCode(92)

/**
 * The "next" page to return to after login, or null if it is not a plain path on this site.
 * Blocks open redirects such as "//evil.example", "/\evil.example" and "https://evil.example".
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) return null
  if (next.startsWith('//') || next.startsWith(`/${BACKSLASH}`)) return null
  // Control characters (tabs, newlines) are stripped by browsers and can hide a second slash.
  for (const char of next) {
    if (char.charCodeAt(0) < 32) return null
  }
  return next
}
