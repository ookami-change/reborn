import { NextResponse } from "next/server";
import { cookieName } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
