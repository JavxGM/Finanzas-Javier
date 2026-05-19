import nodemailer from 'nodemailer'

export function getTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
  })
}

export async function sendMail(subject: string, html: string) {
  const transport = getTransport()
  await transport.sendMail({
    from: `"Finanzas · Javier" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject,
    html,
  })
}
