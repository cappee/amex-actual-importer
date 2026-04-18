// ---------------------------------------------------------------------------
// Pure function that extracts a 6-digit OTP from an email body.
// ---------------------------------------------------------------------------

const OTP_REGEX = /\b\d{6}\b/g;
const HTML_TAG_REGEX = /<[^>]+>/g;

/**
 * Returns the last 6-digit sequence found in the email body, or null if
 * none is present. HTML tags are stripped before matching so HTML and
 * plain-text bodies are handled uniformly.
 */
export function extractOtp(emailBody: string): string | null {
  const text = emailBody.replace(HTML_TAG_REGEX, ' ');
  const matches = text.match(OTP_REGEX);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}
