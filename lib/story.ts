import storyData from "../content/story.json";
import characterData from "../content/characters.json";
export type Line = [string, string];
export type Scene = { id: string; type: string; act: number; title?: string; kicker?: string; lines?: Line[]; poll?: string };
export type Poll = { act: number; title: string; kicker: string; kind: string; question: string; options: { key: string; title: string; text: string }[]; responses?: string[]; followups?: string[]; note: string };
export type History = {title: string; kicker: string; text: string; question: string; keywords: string[]; analysis: string};
export const scenes = storyData.scenes as Scene[];
export const polls = storyData.polls as Record<string, Poll>;
export const histories = storyData.history as Record<string, History>;
export const storyDescription = storyData.description;
export const characters = characterData;
export const pollSteps = Object.fromEntries(scenes.flatMap((s, i) => s.type === "poll" ? [[s.poll!, i]] : []));
export function characterFor(name: string) { return characters.find(c => c.name === name || (name === "国民党联络代表" && c.id === "liaison")); }
