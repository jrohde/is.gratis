/**
 * Sends mail through your own SMTP server. Without one configured, mail goes to the log only:
 * handy in development, and before the mail server in the cluster exists.
 */
import nodemailer from 'nodemailer';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl?: string | null;
}

export interface Mailer {
  /** True when mail is only logged. */
  dryRun: boolean;
  send(mail: OutgoingMail): Promise<void>;
}

export function createMailer(
  config: { smtpUrl: string; from: string },
  logger: { info: (obj: object, msg: string) => void },
): Mailer {
  if (!config.smtpUrl) {
    return {
      dryRun: true,
      send: async (mail) => logger.info({ to: mail.to, subject: mail.subject, text: mail.text }, 'mail (not sent: no SMTP_URL)'),
    };
  }
  const transport = nodemailer.createTransport(config.smtpUrl);
  return {
    dryRun: false,
    send: async (mail) => {
      await transport.sendMail({
        from: config.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.unsubscribeUrl
          ? {
              list: { unsubscribe: { url: mail.unsubscribeUrl, comment: 'Unsubscribe' } },
              headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
            }
          : {}),
      });
    },
  };
}
