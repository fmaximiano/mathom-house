import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string
): Promise<void> {
  const resend = getResend();
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const resetLink = `${appUrl}#reset-password/${resetToken}`;

  await resend.emails.send({
    from: `Mathom House <${from}>`,
    to,
    subject: "Password Reset — Mathom House",
    html: `
      <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #1A1714; color: #E5E1D8; border-radius: 16px;">
        <h2 style="color: #C5A059; margin-bottom: 8px;">Password Reset</h2>
        <p style="font-size: 14px; line-height: 1.7; color: #B0A898;">
          A password reset was requested for your Mathom House admin account. Click the button below to set a new password.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="display: inline-block; padding: 12px 28px; background: #C5A059; color: #12100E; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 12px; color: #6B6560;">
          This link expires in 1 hour. If you did not request this reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #2C251D; margin: 24px 0;" />
        <p style="font-size: 11px; color: #4A4540; text-align: center;">Mathom House — Est. 2026</p>
      </div>
    `,
  });
}
