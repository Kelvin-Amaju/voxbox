import { NextResponse } from "next/server";
import { isOnline } from "@/lib/connectivity";

export async function GET() {
  const online = await isOnline();
  return NextResponse.json({ online, mode: online ? "online" : "offline" });
}
