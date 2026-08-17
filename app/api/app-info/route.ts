import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "Forge Core01",
    service: "forge-core",
    environment: "DEV",
    version: "0.1.0",
  });
}
