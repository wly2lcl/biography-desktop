export const WORLD_TEMPLATE = `# 新世界名称

用一到两句话描述这个世界最独特的氛围与核心冲突。

## 世界概览

- 时代与技术水平：
- 核心规则：
- 普通人的生活状态：

## 地理与地点

- 起始地点：
- 重要区域：

## 阵营与人物

- 主要阵营：
- 关键人物类型：

## 力量体系

- 能力来源：
- 成长方式与代价：

## 历史与冲突

- 近期发生的大事件：
- 当前尚未解决的矛盾：

## 叙事约束

- 故事风格：
- 禁止出现的内容或设定：
`;

export interface WorldDraftValidation {
  errors: string[];
  warnings: string[];
}

export function validateWorldDraft(name: string, content: string): WorldDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmedName = name.trim();
  if (!trimmedName) errors.push('世界名称不能为空');
  if (trimmedName.length > 50) errors.push('世界名称不能超过 50 个字符');
  if (/[\\/:*?"<>|\0]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..') {
    errors.push('世界名称包含文件系统不允许的字符');
  }
  if (content.trim().length < 50) errors.push('世界内容至少需要 50 个字符');
  if (!/^#\s+\S+/m.test(content)) errors.push('世界内容需要一个一级标题（# 标题）');
  const sectionCount = (content.match(/^##\s+\S+/gm) ?? []).length;
  if (sectionCount < 2) warnings.push('建议至少提供两个二级章节，便于模型理解世界结构');
  if (!/冲突|矛盾|危机/.test(content)) warnings.push('建议描述当前冲突或矛盾，让故事更容易启动');
  return { errors, warnings };
}
