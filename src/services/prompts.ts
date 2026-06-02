// src/services/prompts.ts - Prompt templates and formatters

import type { PromptContext } from '../types/prompts';

// ── Built-in prompt templates (from Python prompts.py) ──────────────

const INTRODUCTION_PROMPT = `你是一位武侠小说大师，正在为一个全新的故事写下第一页。

【世界观设定】
{world_context}

{system_context}

【主角姓名】{player_name}

请以大师的笔触，为这位主角写下传奇的开篇。

## 写作要求

### 开场白（prologue）
- 300-500字，像一个优秀小说的第一章开头
- 用第二人称"你"来叙述，营造强烈的代入感
- 从具体的场景开始：一个地点、一个时刻、一种氛围——不要从宏观概述开始
- 要有画面感：调动视觉、听觉、嗅觉等感官细节
- 营造氛围，让读者立刻感受到这个世界的味道
- 自然地暗示主角的命运即将改变
- 如果存在系统设定，自然地融入叙事中，不要像说明书一样列出

### 第一个场景（description + choices）
- description：300-500字，紧接开场白，给出主角面临的第一个具体情境
- 选项：3个有实质差异的方向选择，每个都指向不同的叙事路径

以JSON格式返回：
{{
    "prologue": "开场白正文...",
    "title": "第一章标题",
    "description": "第一个具体场景的描述...",
    "choices": [
        {{"id": "a", "text": "选项文本（不超过15字）", "description": "选项描述"}},
        {{"id": "b", "text": "选项文本", "description": "选项描述"}},
        {{"id": "c", "text": "选项文本", "description": "选项描述"}}
    ]
}}

## 重要提醒
- 整个开场要像小说正文一样流畅叙事，不要像游戏说明
- 选项 text 简短有力（不超过15字），description 可以稍作补充`;

const SCENARIO_PROMPT = `你是一位武侠小说大师，正在用优美的笔触书写一段传奇。

【世界观设定】
{world_context}

{system_context}

【主角】{player_name}

【故事概要】
{summary}

【最近一段剧情】
{latest_scene}

【上一刻的选择】{previous_choice}

你刚刚读到这里。请以大师的笔法，继续写下一段。

## 写作要求

### 叙事连贯性
- **必须紧接上一段剧情**，自然展现上一刻选择的直接后果。不要凭空跳到新地点、新事件
- 保持与前面段落相同的叙事节奏、语言风格和氛围基调
- 人物、场景、对话要前后呼应，不能出现已解决的事情突然重来

### 小说化叙事
- 每一段都要像小说正文一样流畅叙事：有场景、有动作、有对话、有心理活动
- **不要写成游戏说明或任务简报**——这是小说，不是任务描述
- 环境描写要有画面感，调动视觉、听觉、嗅觉等感官细节
- 对话要符合人物性格和世界观设定

### 节奏控制
- 大部分时间，故事应像小说一样自然流动推进
- 只在真正的命运转折点才需要做出选择
- 如果当前没有需要抉择的时刻，描述就是纯粹的小说段落推进剧情

## 输出格式

以JSON格式返回（严格遵循以下结构）：

{{
    "title": "场景标题（简短有力，如'夜宿破庙'、'初遇剑客'）",
    "description": "场景描述（400-600字，像小说正文一样流畅叙事）",
    "choices": [
        {{"id": "a", "text": "选项文本", "description": "选项描述"}}
    ],
    "auto_continue": false,
    "ending": null
}}

### choices 规则
- **只有在真正的关键决策点时**才提供 2-4 个选项
- 选项必须指向不同的叙事方向，不是同一件事换种说法
- 如果当前处于平稳推进状态、没有重要抉择，返回 **空数组 \`[]\`**

### auto_continue 规则
- **choices 为空时**，此字段必须为 \`true\`
- **choices 有选项时**，此字段必须为 \`false\`
- 自动推进时，description 就是纯粹的小说段落

### ending 规则
当故事达到自然终点时填写：
- 角色死亡或牺牲
- 达成毕生追求的目标
- 故事主要命题得到完整解答
- ending 格式：{{"type": "death|peace|legend", "description": "终章描述（150-250字）"}}

## 重要提醒
- description 是你作为小说家写出的正文，不是对剧情的概述
- 要有画面感、有情绪、有张力
- 不要重复已经发生的情节，要推动故事前进
- 选项的 text 要简短有力（不超过15字），description 可以稍作补充`;

const BIOGRAPHY_PROMPT = `你是一位传奇传记作家。根据以下信息，为这位人物撰写一篇完整的传记。

【世界观设定】
{world_context}

{system_context}

【人物姓名】
{player_name}

【人物经历】
{player_history}

请撰写一篇2000-4000字的传记。

传记结构：
1. 标题（如"【{player_name}传奇】"）
2. 引言：人物出身背景、早年经历、初入江湖的契机
3. 主体：按时间顺序叙述关键事件和重要选择，每个选择如何影响人物的命运走向
4. 转折点：人物经历的最大危机或最重要的抉择瞬间
5. 结语：人物的最终归宿、对江湖的影响、后世的评价

风格要求：
- 史诗感与文学性，用优美的中文叙事
- 突出人物性格和每个选择的意义，不要遗漏重要事件
- 结合世界观设定的氛围和背景，但不要照搬设定原文
- 情感真挚，引人入胜，像真正的文学传记
- 早期经历可以简略概括，关键篇章要详细展开
- **只用纯文本，不要使用任何markdown标记、代码块、JSON格式**
- **直接输出传记正文，不要加任何说明或前缀**`;

const QA_PROMPT = `你是一个只了解当前游戏世界的问答助手，回答玩家关于他们经历的问题。

【世界观设定】
{world_context}

{system_context}

【当前状态】
玩家：{player_name}
背包物品：{inventory}
人物属性：{attributes}

【故事概要】
{summary}

【近期经历】
{player_history}

{qa_history_context}

【玩家问题】
{question}

回答要求：
1. 只基于上述信息回答，不要编造
2. 如果问题涉及的内容不在以上信息中，回答「根据目前的经历，我无法回答这个问题」
3. 简洁清晰的中文，适当引用具体事件或场景
4. 如果有相关物品/属性可以佐证，提及它们
5. 如果之前的对话中提到了相关信息，可以引用之前的对话内容`;

const SYSTEM_GENERATION_PROMPT = `你是一个专门设计游戏辅助系统的创意引擎。根据以下世界观和玩家信息，生成3种截然不同的"系统"方案。

【世界观设定】
{world_context}

【玩家姓名】
{player_name}

## 任务要求
每个系统需要包含：
1. **系统名称**：独特、有吸引力
2. **系统描述**：这个系统是什么，如何运作（100-150字）
3. **核心能力**：这个系统赋予玩家的3-5个具体能力

## 设计要求
- 3个系统要有本质差异，不要只是参数不同
- 系统需符合世界观设定，不要脱离世界背景
- 系统能力要具体、可执行、能影响游戏中的选择和剧情
- 每个系统都要有明确的成长路径和特色玩法
- 用中文输出

## 输出格式
以JSON数组格式返回，严格遵循以下结构：
[
    {{
        "id": "a",
        "title": "系统名称",
        "description": "系统描述（100-150字）",
        "abilities": "核心能力说明（列出3-5个具体能力）"
    }},
    {{
        "id": "b",
        "title": "系统名称",
        "description": "系统描述（100-150字）",
        "abilities": "核心能力说明（列出3-5个具体能力）"
    }},
    {{
        "id": "c",
        "title": "系统名称",
        "description": "系统描述（100-150字）",
        "abilities": "核心能力说明（列出3-5个具体能力）"
    }}
]`;

const SUMMARIZATION_PROMPT = `你是一位擅长精炼故事的叙事编辑。请将以下游戏玩家的经历压缩为一段简洁的概要（200-400字），保留关键事件、重要选择和人物成长轨迹。

要求：
- 保留故事的起承转合和关键转折点
- 提及重要的物品获取、能力提升、人际关系变化
- 保持时间顺序
- 用第三人称叙述
- 如果是之前的概要，将新旧内容融合为一份连贯的整体概要

【已有的概要】
{existing_summary}

【需要合并的新经历】
{new_events}

请输出纯文本概要，不要使用markdown或列表：`;

// ── PromptManager class ─────────────────────────────────────────────

class PromptManager {
  introductionPrompt(): string {
    return INTRODUCTION_PROMPT;
  }

  scenarioPrompt(): string {
    return SCENARIO_PROMPT;
  }

  biographyPrompt(): string {
    return BIOGRAPHY_PROMPT;
  }

  qaPrompt(): string {
    return QA_PROMPT;
  }

  systemGenerationPrompt(): string {
    return SYSTEM_GENERATION_PROMPT;
  }

  summarizationPrompt(): string {
    return SUMMARIZATION_PROMPT;
  }

  /**
   * Format a prompt template by replacing {key} placeholders with values
   */
  format(template: string, context: PromptContext): string {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
      result = result.replace(
        new RegExp(`\\{${key}\\}`, 'g'),
        value !== undefined ? String(value) : ''
      );
    }
    return result;
  }

  // ── Formatting helpers ──────────────────────────────────────────

  formatHistory(
    history: Array<{
      scenario: string;
      scenarioDescription: string;
      choice: string;
      choiceId: string;
    }>,
    summary = ''
  ): string {
    const parts: string[] = [];

    if (summary) {
      parts.push(`【故事概要】\n${summary}\n`);
    }

    if (!history.length) {
      parts.push('（尚无经历，故事即将开始）');
    } else {
      parts.push('【近期经历】');
      for (let i = 0; i < history.length; i++) {
        const event = history[i];
        parts.push(`── 第${i + 1}章 ──`);
        parts.push(`场景：${event.scenario}`);
        if (event.scenarioDescription) {
          const desc = event.scenarioDescription.slice(0, 200);
          parts.push(
            `详情：${desc}${event.scenarioDescription.length > 200 ? '…' : ''}`
          );
        }
        parts.push(`你的选择：${event.choice}`);
        parts.push('');
      }
    }

    return parts.join('\n');
  }

  formatLatestScene(
    history: Array<{
      scenario: string;
      scenarioDescription: string;
      choice: string;
      choiceId: string;
    }>
  ): string {
    if (!history.length) return '（故事即将开始）';

    const latest = history[history.length - 1];
    const parts = [`【${latest.scenario}】`];
    if (latest.scenarioDescription) {
      parts.push(latest.scenarioDescription);
    }
    if (latest.choice) {
      parts.push(`\n你的选择：${latest.choice}`);
    }

    return parts.join('\n');
  }

  formatSummaryOnly(
    history: Array<{
      scenario: string;
      scenarioDescription: string;
      choice: string;
      choiceId: string;
    }>,
    summary = ''
  ): string {
    if (summary) return summary;
    if (!history.length) return '（故事即将开始）';

    const beats: string[] = [];
    for (const event of history.slice(-5)) {
      let beat = event.scenario;
      if (event.choice && event.choiceId !== '__auto_continue__') {
        beat += `，${event.choice}`;
      }
      beats.push(beat);
    }

    return beats.length ? beats.join(' → ') : '（故事即将开始）';
  }

  formatQaHistory(
    qaHistory: Array<{ role: string; content: string }>
  ): string {
    if (!qaHistory.length) return '';

    const parts = ['【之前的问答】'];
    for (const entry of qaHistory) {
      const role = entry.role === 'user' ? '问' : '答';
      parts.push(`${role}：${entry.content.slice(0, 200)}`);
    }
    parts.push('');

    return parts.join('\n');
  }

  /**
   * Format history specifically for biography generation.
   *
   * Converts the verbose per-chapter format into a compressed
   * narrative timeline that preserves richness while fitting
   * within LLM token limits.
   *
   * Strategy:
   * - Early chapters: compressed to "场景→选择" one-liners
   * - Recent chapters (last 5): full description preserved
   * - Summary is prepended if available
   */
  formatHistoryForBiography(
    history: Array<{
      scenario: string;
      scenarioDescription: string;
      choice: string;
      choiceId: string;
    }>,
    summary: string = ''
  ): string {
    const parts: string[] = [];

    if (summary) {
      parts.push(`【故事概要】\n${summary}\n`);
    }

    if (!history.length) {
      parts.push('（故事尚未开始）');
    } else {
      const totalChapters = history.length;
      const recentCount = Math.min(5, totalChapters);
      const earlyCount = totalChapters - recentCount;

      if (earlyCount > 0) {
        parts.push('【早期经历】');
        // Compress early chapters: scene → choice in one line
        const earlyEntries = history.slice(0, earlyCount);
        const compressed = earlyEntries
          .map(
            (h) =>
              `${h.scenario} → ${h.choice === '(故事继续)' ? '故事继续' : h.choice}`
          )
          .join('\n');
        parts.push(compressed);
        parts.push('');
      }

      // Recent chapters: full detail preserved
      if (recentCount > 0) {
        parts.push('【关键篇章】');
        const recentEntries = history.slice(-recentCount);
        for (let i = 0; i < recentEntries.length; i++) {
          const chapterNum = earlyCount + i + 1;
          const h = recentEntries[i];
          parts.push(`── 第${chapterNum}章：${h.scenario} ──`);
          if (h.scenarioDescription) {
            // Keep more detail for recent chapters (500 chars)
            const desc = h.scenarioDescription.slice(0, 500);
            parts.push(desc + (h.scenarioDescription.length > 500 ? '……' : ''));
          }
          parts.push(`你的选择：${h.choice}`);
          parts.push('');
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Extract world themes and atmosphere for biography context.
   *
   * Takes the first 3000 characters of world content (which typically
   * contains the overview, key factions, and world flavor) and strips
   * detailed sections that aren't essential for biography writing.
   */
  extractWorldThemes(worldContent: string): string {
    // Keep first 3000 chars which typically contains:
    // - World overview
    // - Geography highlights
    // - Key factions / organizations
    // - Historical background
    // - Legends and mysteries
    const maxChars = 3000;
    if (worldContent.length <= maxChars) return worldContent;

    // Smart truncation: cut at a markdown heading boundary
    const truncated = worldContent.slice(0, maxChars);
    const lastHeading = truncated.lastIndexOf('\n## ');
    if (lastHeading > maxChars * 0.6) {
      return truncated.slice(0, lastHeading) + '\n\n……（世界观细节略）';
    }

    return truncated + '\n\n……（世界观细节略）';
  }

  cleanLLMOutput(text: string): string {
    return text
      .replace(/<thinking>.*?<\/thinking>/gs, '')
      .replace(/<reasoning>.*?<\/reasoning>/gs, '')
      .replace(/<answer>.*?<\/answer>/gs, '')
      .replace(/```(?:json)?\s*/g, '')
      .replace(/\s*```/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const prompts = new PromptManager();
