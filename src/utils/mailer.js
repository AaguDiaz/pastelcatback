const nodemailer = require('nodemailer');
const { AppError } = require('./errors');

let cachedTransporter = null;

const requiredEnv = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

const ensureTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    throw AppError.internal(`Faltan variables de entorno SMTP: ${missing.join(', ')}.`);
  }

  const port = Number(process.env.SMTP_PORT);

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!to) {
    throw AppError.badRequest('Falta el destinatario del correo.');
  }

  const transporter = ensureTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
};

module.exports = {
  sendMail,
};
