import Imap from 'imap';

import { config } from '../config.js';
import { log } from '../logger.js';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  folder: string;
}

function getImapConfig(): ImapConfig {
  return {
    host: config.imap.host,
    port: config.imap.port,
    user: config.imap.user,
    password: config.imap.password,
    tls: true,
    folder: config.imap.folder,
  };
}

/**
 * Poll IMAP for the Amex 2FA verification code.
 * Checks every 5 s, up to `maxWaitMs` (default 120 s).
 * Deletes the email after extracting the code.
 */
export async function waitForAmexVerificationCode(
  sinceTime: Date,
  maxWaitMs = 120_000,
): Promise<string | null> {
  const cfg = getImapConfig();
  log.info('Waiting for Amex verification email (since %s)...', sinceTime.toISOString());

  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < maxWaitMs) {
    attempt++;
    log.debug('IMAP check attempt %d...', attempt);

    const code = await checkForVerificationEmail(cfg, sinceTime);
    if (code) {
      log.info('Found verification code: %s', code);
      return code;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    const remaining = Math.round((maxWaitMs - (Date.now() - start)) / 1000);
    log.debug('No code yet (%ds elapsed, %ds remaining)', elapsed, remaining);

    await new Promise(r => setTimeout(r, 5000));
  }

  log.warn('Timeout waiting for verification email');
  return null;
}

/**
 * Delete an email by UID.
 * On Gmail, moves to Trash (since \Deleted + expunge only removes the label).
 * On standard IMAP, uses \Deleted + expunge.
 */
function deleteEmail(imap: Imap, uid: number, done: () => void): void {
  log.debug('Deleting verification email (uid: %d)...', uid);

  // Try to find Gmail's Trash folder
  imap.getBoxes((err, boxes) => {
    let trashFolder: string | null = null;

    if (!err && boxes) {
      const gmailKey = Object.keys(boxes).find(k => k.startsWith('[G'));
      const children = gmailKey ? boxes[gmailKey]?.children : null;
      if (children) {
        for (const [name, box] of Object.entries(children)) {
          if ((box as Imap.MailBoxes[string])?.attribs?.includes('\\Trash')) {
            trashFolder = `${gmailKey}/${name}`;
            break;
          }
        }
      }
    }

    if (trashFolder) {
      log.debug('Gmail detected, moving to %s', trashFolder);
      imap.move(uid, trashFolder, (err) => {
        if (err) log.debug('Error moving to trash: %s', err.message);
        else log.debug('Verification email moved to %s', trashFolder);
        done();
      });
    } else {
      imap.addFlags(uid, ['\\Deleted'], (err) => {
        if (err) {
          log.debug('Error marking for deletion: %s', err.message);
          done();
          return;
        }
        imap.expunge((err) => {
          if (err) log.debug('Error expunging: %s', err.message);
          else log.debug('Verification email deleted');
          done();
        });
      });
    }
  });
}

/**
 * Single IMAP check: search for Amex verification email,
 * extract 6-digit code, delete the email.
 */
function checkForVerificationEmail(
  cfg: ImapConfig,
  sinceTime: Date,
): Promise<string | null> {
  return new Promise(resolve => {
    const imap = new Imap({
      user: cfg.user,
      password: cfg.password,
      host: cfg.host,
      port: cfg.port,
      tls: cfg.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    let foundCode: string | null = null;
    let foundCodeDate: Date | null = null;
    let foundMessageUid: number | null = null;

    imap.once('ready', () => {
      const mailbox = cfg.folder || 'INBOX';
      imap.openBox(mailbox, false, (err) => {
        if (err) {
          log.debug('Error opening mailbox %s: %s', mailbox, err.message);
          imap.end();
          resolve(null);
          return;
        }

        const searchDate = sinceTime.toISOString().split('T')[0];
        const searchCriteria: unknown[] = [
          ['SINCE', searchDate],
          ['FROM', 'americanexpress'],
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        imap.search(searchCriteria as any, (err, results) => {
          if (err || !results || results.length === 0) {
            if (err) log.debug('Search error: %s', err.message);
            imap.end();
            resolve(null);
            return;
          }

          log.debug('Found %d potential emails', results.length);

          const f = imap.fetch(results.slice(-5), {
            bodies: ['TEXT', 'HEADER.FIELDS (FROM SUBJECT DATE)'],
            struct: true,
          });

          f.on('message', (msg) => {
            let bodyText = '';
            let headers = '';
            let uid: number | null = null;

            msg.on('body', (stream, info) => {
              let buf = '';
              stream.on('data', (chunk: Buffer) => {
                buf += chunk.toString('utf8');
              });
              stream.once('end', () => {
                if (info.which === 'TEXT') bodyText = buf;
                else headers = buf;
              });
            });

            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
            });

            msg.once('end', () => {
              // Check date
              const dateMatch = headers.match(/Date:\s*(.+)/i);
              let emailDate: Date | null = null;
              if (dateMatch) {
                emailDate = new Date(dateMatch[1].trim());
                const sinceWithBuffer = new Date(sinceTime.getTime() - 1000);
                if (emailDate < sinceWithBuffer) return;
              }

              // Check subject / body
              const subjectLower = headers.toLowerCase();
              const bodyLower = bodyText.toLowerCase();
              const isVerification =
                subjectLower.includes('codice di sicurezza') ||
                subjectLower.includes('verification') ||
                subjectLower.includes('codice temporaneo') ||
                bodyLower.includes('codice di autenticazione temporaneo');

              if (!isVerification) return;

              // Extract 6-digit code
              let match = bodyText.match(/codice di autenticazione temporaneo[^0-9]*(\d{6})/i);
              if (!match) match = bodyText.match(/<p[^>]*>(\d{6})<\/p>/i);
              if (!match) match = bodyText.match(/\b(\d{6})\b/);

              if (match) {
                if (!foundCodeDate || (emailDate && emailDate > foundCodeDate)) {
                  foundCode = match[1];
                  foundCodeDate = emailDate;
                  foundMessageUid = uid;
                }
              }
            });
          });

          f.once('error', (err) => {
            log.debug('Fetch error: %s', err.message);
          });

          f.once('end', () => {
            if (foundCode && foundMessageUid) {
              deleteEmail(imap, foundMessageUid, () => {
                imap.end();
                resolve(foundCode);
              });
            } else {
              imap.end();
              resolve(foundCode);
            }
          });
        });
      });
    });

    imap.once('error', (err: Error) => {
      log.debug('IMAP error: %s', err.message);
      resolve(null);
    });

    imap.connect();
  });
}
