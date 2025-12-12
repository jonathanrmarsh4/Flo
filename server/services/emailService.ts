// Reference: Resend integration for transactional emails
import { Resend } from 'resend';
import { logger } from '../logger';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const resetLink = `https://get-flo.com/reset-password?token=${resetToken}`;
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@nuvitaelabs.com>',
      to: email,
      replyTo: 'support@nuvitaelabs.com',
      subject: 'Reset Your Flō Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                  <!-- Logo -->
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <img src="https://get-flo.com/favicon.png" alt="Flō" width="60" height="60" style="display: block; border-radius: 16px;" />
                      <h1 style="margin: 16px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 300;">Flō</h1>
                    </td>
                  </tr>
                  
                  <!-- Card -->
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 500; text-align: center;">
                        Reset Your Password
                      </h2>
                      <p style="margin: 0 0 24px 0; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6; text-align: center;">
                        We received a request to reset your password. Click the button below to create a new password.
                      </p>
                      
                      <!-- Button -->
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td align="center">
                            <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #14b8a6, #06b6d4, #3b82f6); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500; border-radius: 12px;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 24px 0 0 0; color: rgba(255, 255, 255, 0.5); font-size: 13px; text-align: center;">
                        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td align="center" style="padding-top: 32px;">
                      <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                        © ${new Date().getFullYear()} Flō Health. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Reset Your Flō Password\n\nWe received a request to reset your password. Click the link below to create a new password:\n\n${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.\n\n© ${new Date().getFullYear()} Flō Health. All rights reserved.`
    });

    if (error) {
      logger.error('Failed to send password reset email', { error, email });
      return false;
    }

    logger.info('Password reset email sent successfully', { email, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending password reset email', { error, email });
    return false;
  }
}

export async function sendLoginVerificationEmail(
  email: string,
  token: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const verifyLink = `https://get-flo.com/verify-login?token=${token}`;
    const deviceDisplay = deviceInfo || 'Unknown device';
    const locationDisplay = ipAddress || 'Unknown location';
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flo <noreply@nuvitaelabs.com>',
      to: email,
      replyTo: 'support@nuvitaelabs.com',
      subject: 'Verify Your Login - Flo',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                  <!-- Logo -->
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <img src="https://get-flo.com/favicon.png" alt="Flo" width="60" height="60" style="display: block; border-radius: 16px;" />
                      <h1 style="margin: 16px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 300;">Flo</h1>
                    </td>
                  </tr>
                  
                  <!-- Card -->
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 500; text-align: center;">
                        Verify Your Login
                      </h2>
                      <p style="margin: 0 0 16px 0; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6; text-align: center;">
                        A login attempt was made to your Flo account. If this was you, click the button below to verify.
                      </p>
                      
                      <!-- Device info -->
                      <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                        <p style="margin: 0 0 8px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px; text-transform: uppercase;">Login Details</p>
                        <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">Device: ${deviceDisplay}</p>
                        <p style="margin: 4px 0 0 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">IP: ${locationDisplay}</p>
                      </div>
                      
                      <!-- Button -->
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td align="center">
                            <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #14b8a6, #06b6d4, #3b82f6); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500; border-radius: 12px;">
                              Verify Login
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 24px 0 0 0; color: rgba(255, 255, 255, 0.5); font-size: 13px; text-align: center;">
                        This link expires in 10 minutes. If you didn't attempt to log in, please ignore this email and consider changing your password.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td align="center" style="padding-top: 32px;">
                      <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                        &copy; ${new Date().getFullYear()} Flo Health. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Verify Your Flo Login\n\nA login attempt was made to your Flo account.\n\nDevice: ${deviceDisplay}\nIP: ${locationDisplay}\n\nIf this was you, click the link below to verify:\n${verifyLink}\n\nThis link expires in 10 minutes. If you didn't attempt to log in, please ignore this email and consider changing your password.\n\n&copy; ${new Date().getFullYear()} Flo Health. All rights reserved.`
    });

    if (error) {
      logger.error('Failed to send login verification email', { error, email });
      return false;
    }

    logger.info('Login verification email sent successfully', { email, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending login verification email', { error, email });
    return false;
  }
}

export async function sendWelcomeEmail(email: string, firstName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const name = firstName || 'there';
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@nuvitaelabs.com>',
      to: email,
      replyTo: 'support@nuvitaelabs.com',
      subject: 'Welcome to Flō',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                  <!-- Logo -->
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <img src="https://get-flo.com/favicon.png" alt="Flō" width="60" height="60" style="display: block; border-radius: 16px;" />
                      <h1 style="margin: 16px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 300;">Flō</h1>
                    </td>
                  </tr>
                  
                  <!-- Card -->
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 500; text-align: center;">
                        Welcome, ${name}!
                      </h2>
                      <p style="margin: 0 0 24px 0; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6; text-align: center;">
                        You're now part of the Flō community. Start your journey to better health insights by uploading your lab results.
                      </p>
                      
                      <p style="margin: 0; color: rgba(255, 255, 255, 0.6); font-size: 14px; text-align: center;">
                        Track. Improve. Evolve.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td align="center" style="padding-top: 32px;">
                      <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                        © ${new Date().getFullYear()} Flō Health. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Welcome to Flō, ${name}!\n\nYou're now part of the Flō community. Start your journey to better health insights by uploading your lab results.\n\nTrack. Improve. Evolve.\n\n© ${new Date().getFullYear()} Flō Health. All rights reserved.`
    });

    if (error) {
      logger.error('Failed to send welcome email', { error, email });
      return false;
    }

    logger.info('Welcome email sent successfully', { email, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending welcome email', { error, email });
    return false;
  }
}

export async function sendBugReportEmail(
  title: string,
  description: string,
  severity: 'low' | 'medium' | 'high',
  userEmail?: string,
  userId?: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const severityColors = {
      low: '#facc15',
      medium: '#f97316',
      high: '#ef4444'
    };
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@nuvitaelabs.com>',
      to: 'bug@nuvitaelabs.com',
      replyTo: userEmail || undefined,
      subject: `[Bug Report - ${severity.toUpperCase()}] ${title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
                  <!-- Header -->
                  <tr>
                    <td style="background: ${severityColors[severity]}; padding: 16px 24px; border-radius: 12px 12px 0 0;">
                      <h1 style="margin: 0; color: #000; font-size: 18px; font-weight: 600;">
                        Bug Report - ${severity.toUpperCase()} Severity
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 20px; font-weight: 500;">
                        ${title}
                      </h2>
                      
                      <div style="margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px; text-transform: uppercase;">Description</p>
                        <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
                          ${description}
                        </p>
                      </div>
                      
                      <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 20px 0;" />
                      
                      <div style="display: flex; gap: 20px;">
                        <div>
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">User ID</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${userId || 'Not logged in'}</p>
                        </div>
                        <div>
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">User Email</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${userEmail || 'Not provided'}</p>
                        </div>
                        <div>
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">Submitted</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${new Date().toISOString()}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Bug Report - ${severity.toUpperCase()} Severity\n\nTitle: ${title}\n\nDescription:\n${description}\n\nUser ID: ${userId || 'Not logged in'}\nUser Email: ${userEmail || 'Not provided'}\nSubmitted: ${new Date().toISOString()}`
    });

    if (error) {
      logger.error('Failed to send bug report email', { error, title });
      return false;
    }

    logger.info('Bug report email sent successfully', { title, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending bug report email', { error, title });
    return false;
  }
}

export async function sendFeatureRequestEmail(
  title: string,
  description: string,
  userEmail?: string,
  userId?: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@nuvitaelabs.com>',
      to: 'features@nuvitaelabs.com',
      replyTo: userEmail || undefined,
      subject: `[Feature Request] ${title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #a855f7, #8b5cf6); padding: 16px 24px; border-radius: 12px 12px 0 0;">
                      <h1 style="margin: 0; color: #fff; font-size: 18px; font-weight: 600;">
                        Feature Request
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 20px; font-weight: 500;">
                        ${title}
                      </h2>
                      
                      <div style="margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px; text-transform: uppercase;">Description</p>
                        <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
                          ${description}
                        </p>
                      </div>
                      
                      <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 20px 0;" />
                      
                      <div style="display: flex; gap: 20px;">
                        <div>
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">User ID</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${userId || 'Not logged in'}</p>
                        </div>
                        <div>
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">User Email</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${userEmail || 'Not provided'}</p>
                        </div>
                        <div>
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">Submitted</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${new Date().toISOString()}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Feature Request\n\nTitle: ${title}\n\nDescription:\n${description}\n\nUser ID: ${userId || 'Not logged in'}\nUser Email: ${userEmail || 'Not provided'}\nSubmitted: ${new Date().toISOString()}`
    });

    if (error) {
      logger.error('Failed to send feature request email', { error, title });
      return false;
    }

    logger.info('Feature request email sent successfully', { title, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending feature request email', { error, title });
    return false;
  }
}

export async function sendSupportRequestEmail(
  name: string,
  email: string,
  subject: string,
  message: string,
  userId?: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@nuvitaelabs.com>',
      to: 'support@nuvitaelabs.com',
      replyTo: email,
      subject: `[Support Request] ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #14b8a6, #06b6d4); padding: 16px 24px; border-radius: 12px 12px 0 0;">
                      <h1 style="margin: 0; color: #fff; font-size: 18px; font-weight: 600;">
                        Support Request
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 20px; font-weight: 500;">
                        ${subject}
                      </h2>
                      
                      <div style="margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px; text-transform: uppercase;">Message</p>
                        <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
                          ${message}
                        </p>
                      </div>
                      
                      <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 20px 0;" />
                      
                      <div>
                        <div style="margin-bottom: 12px;">
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">From</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${name} &lt;${email}&gt;</p>
                        </div>
                        <div style="margin-bottom: 12px;">
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">User ID</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${userId || 'Not logged in'}</p>
                        </div>
                        <div>
                          <p style="margin: 0 0 4px 0; color: rgba(255, 255, 255, 0.5); font-size: 12px;">Submitted</p>
                          <p style="margin: 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">${new Date().toISOString()}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Support Request\n\nSubject: ${subject}\n\nMessage:\n${message}\n\nFrom: ${name} <${email}>\nUser ID: ${userId || 'Not logged in'}\nSubmitted: ${new Date().toISOString()}`
    });

    if (error) {
      logger.error('Failed to send support request email', { error, subject });
      return false;
    }

    logger.info('Support request email sent successfully', { subject, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending support request email', { error, subject });
    return false;
  }
}

export async function sendAccountApprovalEmail(email: string, firstName?: string | null): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const name = firstName || 'there';
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@nuvitaelabs.com>',
      to: email,
      replyTo: 'support@nuvitaelabs.com',
      subject: 'Welcome to Flō - Your Account is Approved!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                  <!-- Logo -->
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <img src="https://get-flo.com/favicon.png" alt="Flō" width="60" height="60" style="display: block; border-radius: 16px;" />
                      <h1 style="margin: 16px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 300;">Flō</h1>
                    </td>
                  </tr>
                  
                  <!-- Card -->
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 500; text-align: center;">
                        Welcome to Flō!
                      </h2>
                      <p style="margin: 0 0 24px 0; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6; text-align: center;">
                        Hi ${name}, great news! Your account has been approved. You can now log in and start your personalized health journey.
                      </p>
                      
                      <p style="margin: 0 0 24px 0; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6; text-align: center;">
                        Upload your lab results, sync with Apple HealthKit, and let Flō's AI provide you with personalized health insights.
                      </p>
                      
                      <p style="margin: 24px 0 0 0; color: rgba(255, 255, 255, 0.5); font-size: 13px; text-align: center;">
                        Open the Flō app on your device to get started.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td align="center" style="padding-top: 32px;">
                      <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                        © ${new Date().getFullYear()} Flō Health. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Welcome to Flō!\n\nHi ${name}, great news! Your account has been approved. You can now log in and start your personalized health journey.\n\nUpload your lab results, sync with Apple HealthKit, and let Flō's AI provide you with personalized health insights.\n\nOpen the Flō app on your device to get started.\n\n© ${new Date().getFullYear()} Flō Health. All rights reserved.`
    });

    if (error) {
      logger.error('Failed to send account approval email', { error, email });
      return false;
    }

    logger.info('Account approval email sent successfully', { email, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending account approval email', { error, email });
    return false;
  }
}

export async function sendVerificationEmail(email: string, verificationToken: string, firstName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const name = firstName || 'there';
    
    const verifyLink = `https://get-flo.com/verify-email?token=${verificationToken}`;
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@nuvitaelabs.com>',
      to: email,
      replyTo: 'support@nuvitaelabs.com',
      subject: 'Verify Your Flō Account',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <img src="https://get-flo.com/favicon.png" alt="Flō" width="60" height="60" style="display: block; border-radius: 16px;" />
                      <h1 style="margin: 16px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 300;">Flō</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 500; text-align: center;">
                        Welcome, ${name}!
                      </h2>
                      <p style="margin: 0 0 24px 0; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6; text-align: center;">
                        Thanks for signing up for Flō! Tap the button below to verify your email and start your health journey.
                      </p>
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td align="center">
                            <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #14b8a6, #06b6d4, #3b82f6); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500; border-radius: 12px;">
                              Verify & Get Started
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 24px 0 0 0; color: rgba(255, 255, 255, 0.5); font-size: 13px; text-align: center;">
                        This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top: 32px;">
                      <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                        © ${new Date().getFullYear()} Flō Health. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Welcome to Flō, ${name}!\n\nThanks for signing up! Click the link below to verify your email and start your health journey:\n\n${verifyLink}\n\nThis link expires in 24 hours. If you didn't create this account, you can safely ignore this email.\n\n© ${new Date().getFullYear()} Flō Health. All rights reserved.`
    });

    if (error) {
      logger.error('Failed to send verification email', { error, email });
      return false;
    }

    logger.info('Verification email sent successfully', { email, messageId: data?.id });
    return true;
  } catch (error) {
    logger.error('Error sending verification email', { error, email });
    return false;
  }
}
