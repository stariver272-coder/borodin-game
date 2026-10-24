import { compileStory } from './story-document.mjs';

const { story, characters } = compileStory({ checkOnly: process.argv.includes('--check') });
console.log(`台本检查通过：${story.scenes.length} 个场景，${Object.keys(story.polls).length} 轮投票，${characters.length} 位人物。${process.argv.includes('--check') ? '' : '已从剧情台本.txt更新游戏内容。'}`);
