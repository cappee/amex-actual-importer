// ---------------------------------------------------------------------------
// Six-step Amex authentication flow.
//
//   1. POST /login with credentials        → mfaId, assessmentToken
//   2. POST /ReadAuthenticationChallenges  → encryptedValue for EMAIL
//   3. POST /CreateOneTimePasscodeDelivery → trigger OTP email
//   4. otpProvider()                       → wait for OTP (external)
//   5. POST /UpdateAuthenticationToken     → verify OTP
//   6. POST /login (mfaId only)            → active session
// ---------------------------------------------------------------------------

import type { HttpClient } from '../lib/http-client.js';
import type { Logger } from '../lib/logger.js';
import { AmexAuthError, AmexMfaError } from '../lib/errors.js';
import type {
  ChallengeOption,
  ChallengeResponse,
  LoginResponse,
  OtpDeliveryResponse,
  OtpVerifyResponse,
} from '../types/amex.js';
import type { OtpProvider } from '../types/common.js';
import type { Config } from '../config/schema.js';
import { AMEX } from './endpoints.js';
import { randomUUID } from 'node:crypto';

interface AmexAuthDeps {
  httpClient: HttpClient;
  config: Readonly<Config>;
  logger: Logger;
}

export class AmexAuth {
  private readonly http: HttpClient;
  private readonly config: Readonly<Config>;
  private readonly logger: Logger;

  constructor(deps: AmexAuthDeps) {
    this.http = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async authenticate(otpProvider: OtpProvider): Promise<void> {
    this.logger.info('Amex auth: step 1 — initial login');
    const initial = await this.stepInitialLogin();

    if (initial.statusCode === 0) {
      this.logger.info('Amex auth: session established without MFA');
      return;
    }

    if (!initial.reauth) {
      throw new AmexAuthError(
        `Unexpected login response: statusCode=${initial.statusCode}, no reauth payload`,
      );
    }

    const { actionId, applicationId, mfaId, assessmentToken } = initial.reauth;

    this.logger.info('Amex auth: step 2 — read MFA challenges');
    const challenge = await this.stepReadChallenges(assessmentToken, actionId, applicationId);

    const emailOption = this.pickEmailOption(challenge);
    if (!emailOption) {
      throw new AmexMfaError('No OTP_EMAIL challenge option available');
    }

    this.logger.info('Amex auth: step 3 — request OTP delivery via email');
    await this.stepCreateOtpDelivery(emailOption);

    this.logger.info('Amex auth: step 4 — waiting for OTP');
    const otp = await otpProvider();

    this.logger.info('Amex auth: step 5 — verifying OTP');
    await this.stepVerifyOtp(assessmentToken, emailOption, otp);

    this.logger.info('Amex auth: step 6 — finalizing login');
    await this.stepFinalizeLogin(mfaId);

    this.logger.info('Amex auth: login completed');
  }

  private async stepInitialLogin(): Promise<LoginResponse> {
    const body = {
      request_type: 'login',
      Face: AMEX.FACE,
      Logon: 'Logon',
      version: '4',
      inauth_profile_transaction_id: `LOGIN-${randomUUID()}`,
      DestPage: `${AMEX.BASE_URL}/dashboard`,
      UserID: this.config.amex.username,
      Password: this.config.amex.password,
      channel: 'Web',
      REMEMBERME: 'off',
      ...this.timestampFields(),
    };

    const { status, data } = await this.http.post<LoginResponse>(
      `${AMEX.BASE_URL}${AMEX.LOGIN_PATH}`,
      body,
      {
        contentType: 'form',
        headers: { 'challengeable': 'ON' },
      },
    );

    if (status !== 200) {
      throw new AmexAuthError(`Initial login HTTP ${status}`);
    }

    return data;
  }

  private async stepReadChallenges(
    assessmentToken: string,
    actionId: string,
    applicationId: string,
  ): Promise<ChallengeResponse> {
    const { status, data } = await this.http.post<ChallengeResponse>(
      `${AMEX.FUNCTIONS_URL}${AMEX.READ_CHALLENGES}`,
      {
        userJourneyIdentifier: 'aexp.global:create:session',
        assessmentToken,
        meta: {
          authenticationActionId: actionId,
          applicationId,
          locale: AMEX.LOCALE,
        },
      },
    );
    if (status !== 200) {
      throw new AmexMfaError(`ReadAuthenticationChallenges HTTP ${status}`);
    }
    return data;
  }

  private pickEmailOption(response: ChallengeResponse): ChallengeOption | null {
    for (const question of response.challengeQuestions) {
      if (question.category === 'OTP_EMAIL') {
        return question.challengeOptions[0] ?? null;
      }
    }
    return null;
  }

  private async stepCreateOtpDelivery(
    option: ChallengeOption,
  ): Promise<OtpDeliveryResponse> {
    const { status, data } = await this.http.post<OtpDeliveryResponse>(
      `${AMEX.FUNCTIONS_URL}${AMEX.CREATE_OTP}`,
      {
        userJourneyIdentifier: 'aexp.global:create:session',
        otpDeliveryRequest: {
          deliveryMethod: 'EMAIL',
          encryptedValue: option.encryptedValue,
        },
        locale: AMEX.LOCALE,
      },
    );
    if (status !== 200) {
      throw new AmexMfaError(`CreateOneTimePasscodeDelivery HTTP ${status}`);
    }
    return data;
  }

  private async stepVerifyOtp(
    assessmentToken: string,
    option: ChallengeOption,
    otp: string,
  ): Promise<OtpVerifyResponse> {
    const { status, data } = await this.http.post<OtpVerifyResponse>(
      `${AMEX.FUNCTIONS_URL}${AMEX.VERIFY_OTP}`,
      {
        userJourneyIdentifier: 'aexp.global:create:session',
        assessmentToken,
        challengeAnswers: [{
          type: 'OTP',
          value: otp,
          encryptedValue: option.encryptedValue,
        }],
      },
    );
    if (status !== 200) {
      throw new AmexMfaError(`OTP verification HTTP ${status}`);
    }
    if (data.challenge && data.challenge.length > 0) {
      throw new AmexMfaError('OTP verification returned a non-empty challenge');
    }
    return data;
  }

  private async stepFinalizeLogin(mfaId: string): Promise<void> {
    const body = {
      request_type: 'login',
      Face: AMEX.FACE,
      Logon: 'Logon',
      version: '4',
      mfaId,
      ...this.timestampFields(),
    };

    const { status, data } = await this.http.post<LoginResponse>(
      `${AMEX.BASE_URL}${AMEX.LOGIN_PATH}`,
      body,
      { contentType: 'form' },
    );

    if (status !== 200 || data.statusCode !== 0) {
      throw new AmexAuthError(
        `Finalize login failed: HTTP ${status}, statusCode=${data.statusCode}`,
      );
    }
  }

  /** Builds the time-based fields required by the login POST. */
  private timestampFields(): Record<string, string> {
    const now = new Date();
    return {
      b_hour: String(now.getHours()),
      b_minute: String(now.getMinutes()),
      b_second: String(now.getSeconds()),
      b_dayNumber: String(now.getDate()),
      b_month: String(now.getMonth() + 1),
      b_year: String(now.getFullYear()),
      b_timeZone: String(-now.getTimezoneOffset()),
    };
  }
}
