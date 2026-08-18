import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "forge-core",
    timestamp: new Date().toISOString(),
    checked: true,
  });
}
