import Game from "./game";
import {headers} from "next/headers";
import {env} from "cloudflare:workers";
import {chatGPTSignInPath} from "./chatgpt-auth";
import {hostOwner,usesSitesAuth} from "@/lib/host-auth";
export const dynamic="force-dynamic";
export default async function Page(){const owner=await hostOwner(await headers());return <Game signedIn={!!owner} signInHref={usesSitesAuth()?chatGPTSignInPath("/"):"/host/login"} uploadsEnabled={!!env.BUCKET} passwordAuth={!usesSitesAuth()} />;}
