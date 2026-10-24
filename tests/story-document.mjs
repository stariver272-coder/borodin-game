import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { compileStory, parseStoryDocument } from '../scripts/story-document.mjs';
import { storyDocument } from '../scripts/story-vite-plugin.mjs';

// Validate the editable story, but keep parser regression examples independent
// of the user's dialogue changes.
compileStory({checkOnly:true});
const text = readFileSync(new URL('./fixtures/story-document.txt',import.meta.url), 'utf8');
const baseline = parseStoryDocument(text);
assert.deepEqual(parseStoryDocument('\uFEFF' + text.replaceAll('\n', '\r\n')), baseline);
const briefingFields = '说明框标题：讨论前提\n说明框条目：\n  - 已有共识：先共同开展组织工作。\n  - 待议承诺：明确由谁落实：不能只说“以后再谈”。\n';
const withBriefing = text.replace('投票编号：cooperation', briefingFields + '投票编号：cooperation');
assert.deepEqual(parseStoryDocument(withBriefing).story.polls.cooperation.briefing, {title:'讨论前提',items:[{label:'已有共识',text:'先共同开展组织工作。'},{label:'待议承诺',text:'明确由谁落实：不能只说“以后再谈”。'}]});
assert.equal(baseline.story.polls.cooperation.briefing, undefined);
assert.equal(parseStoryDocument(withBriefing).story.polls.identity.briefing, undefined);
assert.throws(()=>parseStoryDocument(withBriefing.replace('  - 已有共识：先共同开展组织工作。','  - 没有小标题和冒号')),/说明框条目请写成/);
assert.throws(()=>parseStoryDocument(withBriefing.replace('说明框标题：讨论前提\n','')),/缺少“说明框标题”/);
const withoutOptionalHeadings=parseStoryDocument(text.replace(/^任务标题：.*\n/m,'').replace(/^揭晓补充：.*\n/m,''));
assert.equal(withoutOptionalHeadings.story.scenes[4].task.title,'');
assert.equal(withoutOptionalHeadings.story.scenes[4].task.intro,baseline.story.scenes[4].task.intro);
assert.equal(withoutOptionalHeadings.story.polls.identity.reveal.note,'');
const minimalNotes=parseStoryDocument(text.replace(/^理由提示：.*\n/gm,'').replace(/^(?:说明|讨论引导|讨论补充|结语)：.*\n/gm,''));
assert.equal(minimalNotes.story.description,'');
assert(Object.values(minimalNotes.story.polls).every(poll=>poll.note===''));
assert.equal(minimalNotes.story.ending.prompt,'');
assert.equal(minimalNotes.story.ending.context,'');
assert.equal(minimalNotes.story.ending.analysis,'');
assert.equal(minimalNotes.story.ending.question,baseline.story.ending.question);
const titleOnly=parseStoryDocument(text.replace('投票编号：cooperation','说明框标题：小剧场\n投票编号：cooperation'));
assert.deepEqual(titleOnly.story.polls.cooperation.briefing,{title:'小剧场',items:[]});
const withAnswer=text.replace('对应投票：cooperation','参考答案：共同目标仍然存在。\n  合作也有需要承担的风险。\n对应投票：cooperation');
const answerData=parseStoryDocument(withAnswer);
assert.equal(answerData.story.history.cooperation.hasAnswer,true);
assert.equal(answerData.answers['scene-7'],'共同目标仍然存在。\n合作也有需要承担的风险。');
assert.equal(JSON.stringify(answerData.story).includes('共同目标仍然存在。'),false,'Unrevealed answers must not be bundled with public story data.');
assert.deepEqual(baseline.answers,{});
const edits = [
  ['标题：鲍罗廷的秘书：三次抉择', '标题：课堂改稿：四次讨论', data => data.story.title, '课堂改稿：四次讨论'],
  ['标题：民族主义：合作的界限', '标题：我修改的第一段', data => data.story.scenes[0].title, '我修改的第一段'],
  ['我只是担心，话写得太满，实际能谈的事情反而少了。', '老师的新台词：包含“引号”、冒号和 <文字>。\n    这里是同一条台词的下一行。', data => data.story.scenes[0].lines.at(-1)[1], '老师的新台词：包含“引号”、冒号和 <文字>。\n这里是同一条台词的下一行。'],
  ['揭晓标题：受保守派委托的是秘书C。', '揭晓标题：新的揭晓说明', data => data.story.polls.identity.reveal.title, '新的揭晓说明'],
  ['任务标题：现在，你扮演的是秘书H', '任务标题：开始你的新任务', data => data.story.scenes[4].task.title, '开始你的新任务'],
  ['任务按钮：以秘书H的身份继续', '任务按钮：接受任务', data => data.story.scenes[4].task.continueLabel, '接受任务'],
  ['选项 A 回应：先推进合作，确实能利用已有的共识。', '选项 A 回应：我改写的回应。先推进合作，确实能利用已有的共识。', data => data.story.polls.cooperation.responses[0].startsWith('我改写的回应。'), true],
  ['标题：历史回顾：支持与限制并存', '标题：历史回顾：老师的新标题', data => data.story.history.land.title, '历史回顾：老师的新标题'],
  ['讨论引导：最后，留下一句话', '讨论引导：请给出你的总结', data => data.story.ending.prompt, '请给出你的总结'],
];
for (const [before, after, select, expected] of edits) {
  assert(text.includes(before), before);
  assert.deepEqual(select(parseStoryDocument(text.replace(before, after))), expected);
}
const renamed = parseStoryDocument(text.replaceAll('秘书H', '秘书乙'));
assert(renamed.characters.some(c => c.name === '秘书乙'));
assert(renamed.story.scenes[0].lines.some(([speaker]) => speaker === '秘书乙'));
const failures = [
  [text.replace('幕：1', '幕：abc'), /幕请填写/],
  [text.replace('【场景 scene-2】', '【场景 scene-1】'), /场景编号缺失或重复/],
  [text.replace('任务按钮：', '任务按纽：'), /缺少“任务按钮”/],
  [text.replace('选项 A 回应：', '遗失的字段：'), /缺少“选项 A 回应”/],
  [text.replace('  旁白：', '  不存在的人物：'), /发言人无效/],
  [text.replace('对应投票：cooperation', '对应投票：nonexistent'), /历史回顾必须/],
  [text.replace('投票编号：cooperation', '投票编号：identity'), /投票编号必须/],
  [text.replace('任务目标：', '任务目标：\n  这行缺少列表符号'), /每项请以/],
  [text.replace('姓名：鲍罗廷', '姓名：鲍罗廷\n姓名：重复姓名'), /重复了/],
  [text + '\n不认识的字段：内容\n', /不认识字段/],
];
for (const [invalid, pattern] of failures) {
  assert.throws(() => parseStoryDocument(invalid), error => /剧情台本\.txt:\d+/.test(error.message) && pattern.test(error.message));
}
mkdirSync('.sites-runtime', {recursive:true});
const directory=mkdtempSync('.sites-runtime/story-document-');
const options={source:join(directory,'台本.txt'),storyOutput:join(directory,'story.json'),charactersOutput:join(directory,'characters.json'),answersOutput:join(directory,'answers.json')};
writeFileSync(options.source,text);compileStory(options);
const first=readFileSync(options.storyOutput,'utf8'),mtime=statSync(options.storyOutput).mtimeMs;
compileStory(options);assert.equal(statSync(options.storyOutput).mtimeMs,mtime);
writeFileSync(options.source,text.replace('标题：民族主义：合作的界限','标题：文件里的新标题'));
compileStory({...options,checkOnly:true});assert.equal(readFileSync(options.storyOutput,'utf8'),first);
compileStory(options);assert.equal(JSON.parse(readFileSync(options.storyOutput,'utf8')).scenes[0].title,'文件里的新标题');
const good=readFileSync(options.storyOutput,'utf8');
writeFileSync(options.source,text.replace('幕：1','幕：无效'));
assert.throws(()=>compileStory(options),/幕请填写/);
assert.equal(readFileSync(options.storyOutput,'utf8'),good,'Invalid documents must not overwrite the last valid game data.');
writeFileSync(options.source,withAnswer);compileStory(options);
const savedAnswers=readFileSync(options.answersOutput,'utf8');
assert.equal(JSON.parse(savedAnswers)['scene-7'],answerData.answers['scene-7']);
writeFileSync(options.source,withAnswer.replace('共同目标仍然存在。','修改后的参考答案。'));
compileStory({...options,checkOnly:true});assert.equal(readFileSync(options.answersOutput,'utf8'),savedAnswers);
compileStory(options);assert.equal(JSON.parse(readFileSync(options.answersOutput,'utf8'))['scene-7'],'修改后的参考答案。\n合作也有需要承担的风险。');
writeFileSync(options.source,text);compileStory(options);assert.deepEqual(JSON.parse(readFileSync(options.answersOutput,'utf8')),{});
// Saving the document refreshes preview data; invalid saves display an error and preserve valid data.
writeFileSync(options.source,text);
const watcher=new EventEmitter(),messages=[],errors=[],httpServer=new EventEmitter();watcher.add=()=>{};
storyDocument(options).configureServer({watcher,ws:{send:message=>messages.push(message)},config:{logger:{error:message=>errors.push(message)}},httpServer})();
writeFileSync(options.source,text.replace('标题：民族主义：合作的界限','标题：保存文档后的新标题'));
watcher.emit('change',options.source);
assert.equal(JSON.parse(readFileSync(options.storyOutput,'utf8')).scenes[0].title,'保存文档后的新标题');
assert.equal(messages.at(-1).type,'full-reload');
writeFileSync(options.source,text.replace('幕：1','幕：错误'));
watcher.emit('change',options.source);assert.equal(messages.at(-1).type,'error');assert.equal(errors.length,1);
assert.equal(JSON.parse(readFileSync(options.storyOutput,'utf8')).scenes[0].title,'保存文档后的新标题');
writeFileSync(options.source,text);watcher.emit('change',options.source);assert.equal(messages.at(-1).type,'full-reload');
httpServer.emit('close');assert.equal(watcher.listenerCount('change'),0);
console.log('PASS: all story content round-trips; dialogue/roles/polls/reveals/ending edits, multiline text, UTF-8 BOM/CRLF, line-numbered errors, validation-only mode, stable outputs and invalid-edit protection.');
