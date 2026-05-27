const nodemailer = require("nodemailer");

const isEmailConfigured = () => {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

const getTransporter = () => {
  if (!isEmailConfigured()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!isEmailConfigured()) {
      console.warn("Email skipped: SMTP not configured");
      return {
        skipped: true,
        reason: "SMTP not configured"
      };
    }

    const transporter = getTransporter();

    if (!transporter) {
      console.warn("Email skipped: SMTP not configured");
      return {
        skipped: true,
        reason: "SMTP not configured"
      };
    }

    const fromName = process.env.SMTP_FROM_NAME || "Reusable Store";
    const fromEmail = process.env.SMTP_FROM_EMAIL || "no-reply@example.com";

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text
    });

    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error("Email sending failed:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  sendEmail,
  isEmailConfigured
};
