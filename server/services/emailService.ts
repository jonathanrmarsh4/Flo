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
      from: fromEmail || 'Flō <noreply@get-flo.com>',
      to: email,
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
                      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #14b8a6, #06b6d4, #3b82f6); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 28px; font-weight: bold;">F</span>
                      </div>
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

export async function sendWelcomeEmail(email: string, firstName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const name = firstName || 'there';
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Flō <noreply@get-flo.com>',
      to: email,
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
                      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #14b8a6, #06b6d4, #3b82f6); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 28px; font-weight: bold;">F</span>
                      </div>
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
