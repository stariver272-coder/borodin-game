import storyData from "../content/story.json";
import characterData from "../content/characters.json";
export type Line = [string, string];
export type Briefing = {title: string; items: {label: string; text: string}[]};
export type Scene = { id: string; type: string; act: number; title?: string; kicker?: string; notice?: string; briefing?: Briefing; lines?: Line[]; poll?: string; task?: {title: string; intro: string; objectives: string[]; continueLabel: string} };
export type Poll = { act: number; title: string; kicker: string; kind: string; question: string; briefing?: Briefing; options: { key: string; title: string; text: string }[]; responses?: string[]; followups?: string[]; referenceAnswers?: Record<string, string>; responseSpeaker?: string; reveal?: {title: string; analysis: string; clues: string[]; note: string; handoff: string}; note: string };
export type History = {title: string; kicker: string; text: string; question: string; keywords: string[]; analysis: string; hasAnswer?: boolean};
export const scenes = storyData.scenes as Scene[];
export const polls = storyData.polls as Record<string, Poll>;
export const histories = storyData.history as Record<string, History>;
export const storyDescription = storyData.description;
export const storyTitle = storyData.title;
export const lobby = storyData.lobby;
export const ending = storyData.ending;
export const characters = characterData;
export const pollSteps = Object.fromEntries(scenes.flatMap((s, i) => s.type === "poll" ? [[s.poll!, i]] : []));
export function characterFor(name: string) { return characters.find(c => c.name === name || (name === "国民党联络代表" && c.id === "liaison")); }
