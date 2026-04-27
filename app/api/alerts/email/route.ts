import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Payload = {
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
};

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function POST(req: NextRequest) {
  if (!smtpConfigured()) {
    return NextResponse.json(
      { ok: false, error: "smtp_not_configured" },
      { status: 501 }
    );
  }
  const body = (await req.json()) as Payload;
  const to = (body.to || "").trim();
  if (!to) return NextResponse.json({ ok: false, error: "missing_to" }, { status: 400 });

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "weather@localhost";
  await transport.sendMail({
    from,
    to,
    subject: body.subject || "WeatherRadar Alert",
    text: body.text || "",
    html: body.html || undefined
  });
  return NextResponse.json({ ok: true });
}
