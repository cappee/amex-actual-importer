// ----------------------------------------
// Types for data from Amex IT API
// ----------------------------------------

/** Single AMEX transaction */
export interface AmexTransaction {
  identifier: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  chargeDate: string;
  postDate: string;
  status: 'posted' | 'pending';
  merchantName: string;
  merchantAddress?: {
    city?: string;
    country?: string;
    countryName?: string;
  };
  walletProvider?: string;
  foreignDetails?: {
    amount?: number;
    currency?: string;
    exchangeRate?: number;
  };
}

/** Response to the first POST /login */
export interface LoginResponse {
  statusCode: number;
  reauth?: {
    actionId: string;
    applicationId: string;
    mfaId: string;
    assessmentToken: string;
  };
}

/** Single challenge option (SMS, EMAIL, etc.) */
export interface ChallengeOption {
  type: string;
  maskedValue: string;
  encryptedValue: string;
}

/** Response to ReadAuthenticationChallenges.v3 */
export interface ChallengeResponse {
  challenge: string;
  challengeQuestions: Array<{
    category: 'OTP_SMS' | 'OTP_EMAIL';
    challengeOptions: ChallengeOption[];
  }>;
}

/** Response to CreateOneTimePasscodeDelivery.v3 */
export interface OtpDeliveryResponse {
  validityDuration: number;
  validityUnit: string;
  remainingAttempts: number;
  encryptedChannelValue: string;
}

/** Response to UpdateAuthenticationTokenWithChallenge.v3 (success) */
export interface OtpVerifyResponse {
  challenge: string;
  pendingChallenges: unknown[];
}

/** Raw response from the transactions endpoint */
export interface TransactionsApiResponse {
  total_count: number;
  transactions: Array<{
    identifier: string;
    description: string;
    amount: number;
    type: 'DEBIT' | 'CREDIT';
    charge_date: string;
    post_date: string;
    extended_details?: {
      merchant?: {
        name?: string;
        address?: {
          city?: string;
          country?: string;
          country_name?: string;
        };
      };
      additional_attributes?: {
        wallet_provider?: string;
      };
    };
    foreign_details?: {
      amount?: number;
      iso_alpha_currency_code?: string;
      currency?: string;
      exchange_rate?: number;
      conversion_rate?: number;
    };
  }>;
}