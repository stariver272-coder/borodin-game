import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const documentPath = fileURLToPath(new URL('../content/剧情台本.txt', import.meta.url));
const storyPath = fileURLToPath(new URL('../content/story.json', import.meta.url));
const charactersPath = fileURLToPath(new URL('../content/characters.json', import.meta.url));
const answersPath = fileURLToPath(new URL('../content/answers.json', import.meta.url));

export function parseStoryDocument(input, filename = 'content/剧情台本.txt') {
  const fail = (line, message) => { throw new Error(`${filename}:${line} ${message}`); };
  const blocks = [];
  let block, field;
  for (const [index, raw] of input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = index + 1;
    if (raw.startsWith('//') || !raw.trim()) continue;
    const header = raw.match(/^【(作品|人物|开场|场景)(?:\s+([\w-]+))?】\s*$/);
    if (header) {
      block = { kind: header[1], id: header[2], line, fields: new Map(), used: new Set() };
      blocks.push(block); field = null; continue;
    }
    if (!block) fail(line, '正文必须放在【作品】、【人物 编号】、【开场】或【场景 编号】内；编辑说明请以 // 开头。');
    const label = raw.match(/^([^\s：:][^：:]*?)[：:]\s*(.*)$/);
    if (label) {
      const key = label[1].trim();
      if (block.fields.has(key)) fail(line, `“${key}”重复了。`);
      field = { line, lines: label[2] ? [label[2]] : [] };
      block.fields.set(key, field);
    } else if (/^\s/.test(raw) && field) {
      field.lines.push(raw.replace(/^(?: {2}|\t)/, '').trimEnd());
    } else fail(line, '正文续行请缩进两个空格；字段请写成“标题：内容”这样的格式。');
  }
  function value(b, key, optional = false) {
    b.used.add(key);
    const f = b.fields.get(key), text = f?.lines.join('\n').trim() ?? '';
    if (!text && !optional) fail(f?.line ?? b.line, `缺少“${key}”内容。`);
    return text;
  }
  function list(b, key) {
    const text = value(b, key);
    return text.split('\n').map(line => {
      if (!/^\s*[-•]\s+\S/.test(line)) fail(b.fields.get(key).line, `“${key}”每项请以“- ”开头。`);
      return line.replace(/^\s*[-•]\s+/, '').trim();
    });
  }
  function finish(b) {
    for (const [key, f] of b.fields) if (!b.used.has(key)) fail(f.line, `不认识字段“${key}”，请保留原来的字段名。`);
  }
  function briefing(b) {
    if (!b.fields.has('说明框标题') && !b.fields.has('说明框条目')) return;
    const items = value(b, '说明框条目', true) ? list(b, '说明框条目') : [];
    return { title: value(b, '说明框标题'), items: items.map(item => {
      const match = item.match(/^([^：:]+)[：:]\s*(\S[\s\S]*)$/);
      if (!match || !match[1].trim()) fail(b.fields.get('说明框条目').line, '说明框条目请写成“- 小标题：内容”。');
      return { label: match[1].trim(), text: match[2] };
    }) };
  }
  function only(kind) {
    const found = blocks.filter(b => b.kind === kind);
    if (found.length !== 1) fail(found[1]?.line ?? 1, `需要且只能有一个【${kind}】。`);
    return found[0];
  }
  const meta = only('作品'), opening = only('开场');
  const story = { title: value(meta, '标题'), description: value(meta, '说明', true), scenes: [], polls: {}, history: {},
    lobby: { title: value(opening, '标题'), intro: value(opening, '介绍'), note: value(opening, '阅读提示') } };
  finish(meta); finish(opening);
  const ids = new Set();
  const characters = blocks.filter(b => b.kind === '人物').map(b => {
    if (!b.id || ids.has(b.id)) fail(b.line, '人物编号缺失或重复。');
    ids.add(b.id);
    const character = { id: b.id, name: value(b, '姓名'), description: value(b, '介绍'), monogram: value(b, '姓名占位'), color: value(b, '底色'), image: value(b, '图片', true) };
    if (!/^#[\da-f]{6}$/i.test(character.color)) fail(b.line, '底色请使用 #345c52 这样的六位颜色值。');
    finish(b); return character;
  });
  if (!characters.length) fail(1, '至少保留一位人物。');
  if (new Set(characters.map(c => c.name)).size !== characters.length) fail(1, '人物姓名不能重复。');
  const speakers = new Set(['旁白', '国民党联络代表', ...characters.map(c => c.name)]);
  const sceneIds = new Set(), answers = {};
  for (const b of blocks.filter(b => b.kind === '场景')) {
    if (!b.id || sceneIds.has(b.id)) fail(b.line, '场景编号缺失或重复。');
    sceneIds.add(b.id);
    const type = { '对话': 'dialogue', '投票': 'poll', '历史回顾': 'history', '终场': 'summary' }[value(b, '类型')];
    const act = Number(value(b, '幕'));
    if (!type) fail(b.line, '类型只能是“对话”“投票”“历史回顾”或“终场”。');
    if (!Number.isInteger(act) || act < 1 || act > 4) fail(b.line, '幕请填写 1、2、3 或 4（终场）。');
    const scene = { type, act, id: b.id };
    if (type === 'dialogue') {
      scene.title = value(b, '标题'); scene.kicker = value(b, '时间地点');
      const note = briefing(b); if (note) scene.briefing = note;
      const notice = value(b, '情境说明', true); if (notice) scene.notice = notice;
      if (['任务标题', '任务说明', '任务目标', '任务按钮'].some(key => b.fields.has(key))) scene.task = { title: value(b, '任务标题', true), intro: value(b, '任务说明'), objectives: list(b, '任务目标'), continueLabel: value(b, '任务按钮') };
      scene.lines = [];
      for (const line of value(b, '台词').split('\n')) {
        if (/^\s/.test(line) && scene.lines.length) { scene.lines.at(-1)[1] += '\n' + line.trim(); continue; }
        const match = line.match(/^([^：:]+)[：:]\s*(.+)$/);
        if (!match || !speakers.has(match[1])) fail(b.fields.get('台词').line, `台词中的发言人无效：“${line.slice(0,30)}”。请使用人物姓名或“旁白”。`);
        scene.lines.push([match[1], match[2]]);
      }
    } else if (type === 'poll') {
      const id = value(b, '投票编号'); scene.poll = id;
      if (!/^[a-z][a-z0-9_-]*$/.test(id) || Object.hasOwn(story.polls, id)) fail(b.line, '投票编号必须是唯一的英文编号。');
      const kind = { '身份': 'identity', '政策': 'policy' }[value(b, '题型')];
      if (!kind) fail(b.line, '题型只能填写“身份”或“政策”。');
      const poll = { act, title: value(b, '标题'), kicker: value(b, '时间地点'), kind, question: value(b, '问题'), options: [], note: value(b, '理由提示', true) };
      const note = briefing(b); if (note) poll.briefing = note;
      const keys = [...b.fields.keys()].flatMap(key => key.match(/^选项 ([A-Z0-9]+) 标题$/)?.slice(1) ?? []);
      if (keys.length < 2) fail(b.line, '每轮投票至少需要两个选项。');
      for (const key of keys) poll.options.push({ key, title: value(b, `选项 ${key} 标题`), text: value(b, `选项 ${key} 内容`) });
      if (kind === 'identity') {
        poll.reveal = { title: value(b, '揭晓标题'), analysis: value(b, '揭晓解释'), clues: list(b, '揭晓线索'), note: value(b, '揭晓补充', true), handoff: value(b, '角色交接') };
      } else {
        poll.responseSpeaker = value(b, '回应人');
        poll.responses = keys.map(key => value(b, `选项 ${key} 回应`));
        poll.followups = keys.map(key => value(b, `选项 ${key} 追问`));
        const referenceAnswers = Object.fromEntries(keys.map(key => [key, value(b, `选项 ${key} 参考答案`, true)]).filter(([, answer]) => answer));
        if (Object.keys(referenceAnswers).length) poll.referenceAnswers = referenceAnswers;
      }
      story.polls[id] = poll;
    } else if (type === 'history') {
      const id = value(b, '对应投票'); scene.poll = id;
      if (!Object.hasOwn(story.polls, id)) fail(b.line, '历史回顾必须放在对应投票之后，且编号一致。');
      if (Object.hasOwn(story.history, id)) fail(b.line, '同一投票不能有两段历史回顾。');
      story.history[id] = { title: value(b, '标题'), kicker: value(b, '时间地点'), text: value(b, '正文'), question: value(b, '讨论问题'), keywords: list(b, '关键词'), analysis: value(b, '分析') };
      const answer = value(b, '参考答案', true);
      if (answer) { answers[b.id] = answer; story.history[id].hasAnswer = true; }
    } else {
      if (story.ending) fail(b.line, '只能有一段终场。');
      story.ending = { kicker: value(b, '时间地点', true), title: value(b, '标题'), prompt: value(b, '讨论引导', true), question: value(b, '讨论问题'), context: value(b, '讨论补充', true), analysis: value(b, '结语', true) };
    }
    finish(b); story.scenes.push(scene);
  }
  if (!story.scenes.length || story.scenes.at(-1).type !== 'summary' || !Object.keys(story.polls).length) fail(1, '台本需要至少一轮投票，并以终场结束。');
  if (story.scenes.slice(0,-1).some(scene => scene.type === 'summary')) fail(1, '终场必须是最后一个场景。');
  return { story, characters, answers };
}

export function compileStory({ checkOnly = false, source = documentPath, storyOutput = storyPath, charactersOutput = charactersPath, answersOutput = answersPath } = {}) {
  const data = parseStoryDocument(readFileSync(source, 'utf8'), source);
  if (!checkOnly) for (const [path, content] of [[storyOutput, data.story], [charactersOutput, data.characters], [answersOutput, data.answers]]) {
    const text = JSON.stringify(content, null, 2) + '\n';
    let previous; try { previous = readFileSync(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous !== text) writeFileSync(path, text, 'utf8');
  }
  return data;
}
