import Game from "./game";
import {getChatGPTUser,chatGPTSignInPath} from "./chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Page(){const user=await getChatGPTUser();return <Game signedIn={!!user} signInHref={chatGPTSignInPath("/")} />;}
