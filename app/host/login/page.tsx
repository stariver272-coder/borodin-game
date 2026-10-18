import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hostOwner, usesSitesAuth } from "@/lib/host-auth";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import HostLoginForm from "./form";
import "./login.css";

export const dynamic = "force-dynamic";

export default async function HostLoginPage() {
  if (usesSitesAuth()) redirect(chatGPTSignInPath("/"));
  if (await hostOwner(await headers())) redirect("/");
  return <main className="host-login-page"><section className="host-login-card">
    <p className="eyebrow">鲍罗廷的秘书 · 三次抉择</p>
    <h1>主持人登录</h1>
    <p>登录后可以创建房间、推进剧情和管理人物素材。</p>
    <HostLoginForm />
    <a className="host-login-back" href="/">我是参与者，返回首页加入房间</a>
  </section></main>;
}
