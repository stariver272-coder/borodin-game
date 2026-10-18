import { env } from "cloudflare:workers";
import { digest, GameError } from "./engine";

export const HOST_COOKIE = "borodin_host";
const SESSION_SECONDS = 12 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function usesSitesAuth() {
  return env.AUTH_MODE === "sites";
}

function configuredPassword(): string {
  const password = env.HOST_PASSWORD;
  if (!password || password.length < 16 || password.length > 256) {
    throw new GameError("主持人登录尚未配置，请联系网站管理员。", 503);
  }
  return password;
}

function authDatabase() {
  if (!env.DB) throw new GameError("房间服务尚未就绪，请稍后刷新。", 503);
  return env.DB;
}

function sessionToken(headers: Headers): string {
  const token = headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(HOST_COOKIE + "="))?.slice(HOST_COOKIE.length + 1) ?? "";
  return /^[a-f0-9]{64}$/.test(token) ? token : "";
}

async function passwordVersion(password: string) {
  return digest("borodin-host-password-v1:" + password);
}

export async function hostOwner(headers: Headers): Promise<string | null> {
  // Only an explicitly configured Sites deployment trusts its gateway headers.
  if (usesSitesAuth()) return headers.get("oai-authenticated-user-id") || null;
  const token = sessionToken(headers);
  if (!token) return null;
  if (!env.HOST_PASSWORD || env.HOST_PASSWORD.length < 16 || env.HOST_PASSWORD.length > 256) return null;
  const version = await passwordVersion(env.HOST_PASSWORD);
  const session = await authDatabase().prepare(
    "SELECT owner FROM host_sessions WHERE token_hash=? AND expires_at>? AND password_version=?",
  ).bind(await digest(token), Date.now(), version).first<{ owner: string }>();
  return session?.owner ?? null;
}

export async function requireHost(request: Request): Promise<string> {
  const owner = await hostOwner(request.headers);
  if (!owner) throw new GameError("请先登录主持人账号。", 401);
  return owner;
}

export function requireSameOrigin(request: Request) {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new GameError("请通过 HTTPS 登录。", 403);
  if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new GameError("请在游戏网页中进行操作。", 403);
  }
}

export async function signInHost(request: Request, password: unknown): Promise<string> {
  if (usesSitesAuth()) throw new GameError("请使用当前网站的登录入口。", 400);
  requireSameOrigin(request);
  const expected = configuredPassword();
  if (typeof password !== "string" || password.length > 256) throw new GameError("密码格式无效。");
  const db = authDatabase(), now = Date.now(), cutoff = now - LOGIN_WINDOW_MS;
  // Cloudflare supplies this header at the edge. No user-provided forwarding header is trusted.
  const key = await digest(request.headers.get("cf-connecting-ip") || "local-preview");
  await db.prepare("DELETE FROM host_login_limits WHERE window_start<?").bind(cutoff).run();
  const attempt = await db.prepare(
    "INSERT INTO host_login_limits(ip_hash,window_start,attempts) VALUES(?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET attempts=host_login_limits.attempts+1 RETURNING attempts",
  ).bind(key, now).first<{ attempts: number }>();
  if (!attempt || attempt.attempts > 10) throw new GameError("登录尝试过多，请 15 分钟后再试。", 429);
  const [actualHash, expectedHash] = await Promise.all([digest(password), digest(expected)]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index++) difference |= actualHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  if (difference !== 0) throw new GameError("主持人密码不正确。", 401);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  await db.prepare("DELETE FROM host_sessions WHERE expires_at<=?").bind(now).run();
  await db.prepare("INSERT INTO host_sessions(token_hash,owner,expires_at,password_version) VALUES(?,?,?,?)")
    .bind(await digest(token), "standalone-host", now + SESSION_SECONDS * 1000, await passwordVersion(expected)).run();
  return cookie(request, token, SESSION_SECONDS);
}

export async function signOutHost(request: Request): Promise<string> {
  requireSameOrigin(request);
  const token = sessionToken(request.headers);
  if (token) await authDatabase().prepare("DELETE FROM host_sessions WHERE token_hash=?").bind(await digest(token)).run();
  return cookie(request, "", 0);
}

function cookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${HOST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
