import { GameError } from "@/lib/engine";
import { failure } from "@/lib/http";
import { signInHost, signOutHost } from "@/lib/host-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new GameError("请求格式无效。", 415);
    const raw = await request.text();
    if (raw.length > 2048) throw new GameError("请求内容过长。", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new GameError("请求格式无效。"); }
    const cookie = await signInHost(request, body?.password);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const cookie = await signOutHost(request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
