// ---------------------------------------------------------------------------
// URLs and constants for the American Express Italy API.
// `as const` makes every value a literal type.
// ---------------------------------------------------------------------------

export const AMEX = {
  BASE_URL: 'https://global.americanexpress.com',
  FUNCTIONS_URL: 'https://functions.americanexpress.com',
  LOGIN_PATH: '/myca/logon/emea/action/login',
  READ_CHALLENGES: '/ReadAuthenticationChallenges.v3',
  CREATE_OTP: '/CreateOneTimePasscodeDelivery.v3',
  VERIFY_OTP: '/UpdateAuthenticationTokenWithChallenge.v3',
  TRANSACTIONS_PATH: '/api/servicing/v1/financials/transactions',
  UPDATE_SESSION: '/UpdateUserSession.v1',
  LOCALE: 'it-IT',
  FACE: 'it_IT',
} as const;

/** Common browser-like headers required by the Amex endpoints. */
export const DEFAULT_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'it-IT,it;q=0.9,en;q=0.8',
};
