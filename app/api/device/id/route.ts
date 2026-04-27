import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function readIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "local-device";
}

export async function GET(req: NextRequest) {
  const ip = readIp(req);
  const safe = ip.replace(/[^a-zA-Z0-9.:_-]/g, "");
  return NextResponse.json({ ok: true, deviceId: safe || "local-device" });
}
