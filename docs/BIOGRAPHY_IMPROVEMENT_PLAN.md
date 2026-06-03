# 传记生成改进方案

> 创建日期: 2026-06-03 | 状态: 待审批

---

## 一、需求回顾

1. **传记基于实际旅程**：根据实际旅程数据生成，不随意编造
2. **主动结束时传记同步结束**：用户主动结束旅程时，传记应到那时为止结束，可用"未完待续"结尾
3. **弹窗确认**：主动结束时应弹出确认框询问是否生成传记，选择"否"则不生成

---

## 二、当前问题分析

### 问题 1：确认弹窗无跳过选项

**文件**: `src/App.tsx:79-92`

```
用户点击"结束旅程" → ConfirmModal 弹出
消息: "确定要结束当前的旅程吗？你可以随时查看已生成的传记。"
确认 → endGame() → 无条件调用 generateBiography()
```

- 弹窗消息暗示传记已存在（实际还没生成）
- 确认后**强制**生成传记，用户无法跳过

### 问题 2：`endGame()` 无条件生成传记

**文件**: `src/store/gameStore.ts:580-589`

```typescript
endGame: () => {
    set({ showConfirmEnd: false });
    const { session, storage } = get();
    if (session) {
        session.isActive = false;
        storage.saveSession(session);
    }
    get().generateBiography();  // ← 无条件调用
},
```

### 问题 3：传记提示词无"未完待续"逻辑

**文件**: `src/services/prompts.ts:123-152`

`BIOGRAPHY_PROMPT` 始终要求完整结构（引言 → 主体 → 转折点 → 结语），没有区分"旅程自然完结"和"玩家主动中途结束"两种情况。

### 问题 4：无法区分结束原因

**文件**: `src/types/models.ts:39-49`

`GameSession` 只有 `isActive: boolean`，没有记录结束原因（主动结束 / LLM ending / 达到上限）。

---

## 三、修改方案

### 修改 1：类型定义 — 增加 `endReason` 字段

**文件**: `src/types/models.ts`

```typescript
// 新增结束原因类型
export type EndReason = 'player_ended' | 'story_ending' | 'max_choices' | 'max_history';

// GameSession 增加字段
export interface GameSession {
  sessionId: string;
  world: string;
  gameMode: 'basic' | 'system';
  system?: string;
  player: PlayerState;
  scenarios: Scenario[];
  isActive: boolean;
  endReason?: EndReason;          // ← 新增
  biography?: string;
  createdAt: string;
}
```

### 修改 2：游戏引擎 — 记录结束原因

**文件**: `src/game/engine.ts`

在 `processChoice()` 中设置 `endReason`：

| 触发条件 | endReason |
|---------|-----------|
| `choiceId === 'end'` 或 `'end_journey'` | `'player_ended'` |
| LLM 返回 `ending` 字段 | `'story_ending'` |
| 达到 `maxChoices` | `'max_choices'` |
| 达到 `maxHistoryHardCap` | `'max_history'` |

### 修改 3：游戏商店 — 拆分结束与传记生成

**文件**: `src/store/gameStore.ts`

#### 3.1 修改 `endGame()` — 仅标记结束，不生成传记

```typescript
endGame: (generateBio: boolean = true) => {
    set({ showConfirmEnd: false, showConfirmBio: false });
    const { session, storage } = get();
    if (session) {
        session.isActive = false;
        session.endReason = 'player_ended';
        storage.saveSession(session);
    }
    if (generateBio) {
        get().generateBiography();
    }
},
```

#### 3.2 新增状态和动作

```typescript
// 新增 UI 状态
interface GameState {
    // ... 现有字段
    showConfirmBio: boolean;  // ← 新增：是否弹出"是否生成传记"确认框
    skipBiography: () => void; // ← 新增：跳过传记生成
}

skipBiography: () => {
    set({ showConfirmBio: false });
    // 留在游戏界面，显示旅程已结束状态
},
```

### 修改 4：App.tsx — 两步确认流程

**文件**: `src/App.tsx`

将现有的单步确认改为两步：

```
用户点击"结束旅程"
  → 第1步 ConfirmModal: "确定要结束当前的旅程吗？"
    → 确认 → 设置 isActive = false
    → 第2步 ConfirmModal: "是否现在生成传记？"
      → 是 → generateBiography()
      → 否 → skipBiography()，留在游戏结束界面
```

具体变更：

```tsx
// 第1步：确认结束旅程（现有逻辑修改）
{showConfirmEnd && (
    <ConfirmModal
        title="结束旅程"
        message="确定要结束当前的旅程吗？"
        confirmText="结束旅程"
        cancelText="继续游戏"
        onConfirm={() => {
            // 结束旅程，然后弹出第2步确认
            const store = useGameStore.getState();
            const { session, storage } = store;
            if (session) {
                session.isActive = false;
                session.endReason = 'player_ended';
                storage.saveSession(session);
            }
            store.setShowConfirmEnd(false);
            store.setShowConfirmBio(true);  // ← 弹出第2步
        }}
        onCancel={() => useGameStore.getState().setShowConfirmEnd(false)}
    />
)}

// 第2步：确认是否生成传记（新增）
{showConfirmBio && (
    <ConfirmModal
        title="生成传记"
        message="旅程已结束。是否现在生成专属传记？"
        confirmText="生成传记"
        cancelText="稍后再说"
        onConfirm={() => {
            useGameStore.getState().setShowConfirmBio(false);
            useGameStore.getState().generateBiography();
        }}
        onCancel={() => {
            useGameStore.getState().skipBiography();
        }}
    />
)}
```

### 修改 5：传记提示词 — 支持"未完待续"

**文件**: `src/services/prompts.ts`

#### 5.1 修改 `formatHistoryForBiography()` 签名

```typescript
formatHistoryForBiography(
    history: HistoryEntry[],
    summary: string = '',
    isComplete: boolean = true   // ← 新增参数，默认 true 保持向后兼容
): string
```

当 `isComplete = false`（主动中途结束）时，在历史末尾追加提示：

```typescript
if (!isComplete) {
    parts.push('\n【旅程状态】主角的旅程在此处暂时中止，故事尚未完结。');
}
```

#### 5.2 修改 `BIOGRAPHY_PROMPT` 模板

在现有模板中增加条件段落：

```
{ending_instruction}

// ending_instruction 根据 isComplete 注入不同内容：
// isComplete = true: （不注入任何内容，使用默认的完整传记结构）
// isComplete = false: 
// 注意：这段旅程尚未完结，主角的故事在途中暂停。
// 传记应在最后已知事件处自然收束，以"未完待续"的笔调结尾，
// 暗示故事仍有后续可能。不要编造旅途结束后的情节。
```

具体实现方式：在 `biographyPrompt()` 方法中增加参数：

```typescript
biographyPrompt(isComplete: boolean = true): string {
    // ... 原有模板 ...
    // 末尾追加：
    if (!isComplete) {
        return basePrompt + `\n\n【特别注意】这段旅程尚未完结，主角的故事在途中暂停。
请在最后已知事件处自然收束，以"未完待续"的笔调结尾，
暗示故事仍有后续可能。不要编造旅途结束后的情节。`;
    }
    return basePrompt;
}
```

#### 5.3 修改 `generateBiography()` 调用

**文件**: `src/store/gameStore.ts`

```typescript
generateBiography: async () => {
    // ... 现有代码 ...
    const isComplete = session.endReason === 'story_ending' 
        || session.endReason === 'max_choices' 
        || session.endReason === 'max_history'
        || !session.endReason;  // 无 endReason 视为完整结束

    const bioPrompt = prompts.format(prompts.biographyPrompt(isComplete), {
        // ... 现有参数 ...
    });
    // ...
},
```

### 修改 6：GameScreen — 调整界面文案

**文件**: `src/components/screens/GameScreen.tsx`

旅程结束面板（`isInactive` 时显示）文案更新：

```tsx
{isInactive && (
    <div className="mt-8 p-5 bg-primary-500/10 border border-primary-500/30 rounded-xl text-center animate-slide-up">
        <p className="text-primary-200 text-base font-medium mb-1">
            {session.endReason === 'player_ended' ? '旅程已主动结束' : '旅程已结束'}
        </p>
        <p className="text-gray-400 text-sm mb-4">
            {session.endReason === 'player_ended' 
                ? '你选择了在此处停下脚步。可以生成传记记录这段旅程，或稍后继续。' 
                : '你的冒险故事已经画上句号，现在可以生成一部专属传记来记录这段传奇。'}
        </p>
        {!session.biography && (
            <button onClick={generateBiography} className="btn-primary">
                生成传记
            </button>
        )}
        {session.biography && (
            <button onClick={() => useGameStore.getState().setScreen('biography')} className="btn-primary">
                查看传记
            </button>
        )}
    </div>
)}
```

### 修改 7：i18n — 新增文案

**文件**: `src/i18n/locales/zh-CN.json`

```json
{
    "screens.game.endJourney.confirm": "确定要结束当前的旅程吗？",
    "screens.game.endJourney.generateBio": "是否现在生成专属传记？",
    "screens.game.endJourney.generateBioConfirm": "生成传记",
    "screens.game.endJourney.generateBioCancel": "稍后再说",
    "screens.game.ended.playerEnded": "旅程已主动结束",
    "screens.game.ended.naturalEnd": "旅程已结束",
    "screens.game.ended.playerDesc": "你选择了在此处停下脚步。可以生成传记记录这段旅程。",
    "screens.game.ended.naturalDesc": "你的冒险故事已经画上句号，现在可以生成一部专属传记来记录这段传奇。"
}
```

---

## 四、修改文件清单

| # | 文件 | 修改类型 | 说明 |
|---|------|---------|------|
| 1 | `src/types/models.ts` | 新增字段 | `GameSession` 增加 `endReason?: EndReason` |
| 2 | `src/game/engine.ts` | 修改逻辑 | `processChoice()` 设置 `endReason`；`applyNextScenario()` 设置自然结束的 `endReason` |
| 3 | `src/store/gameStore.ts` | 修改+新增 | `endGame()` 拆分；新增 `showConfirmBio` 状态和 `skipBiography()` 动作；`generateBiography()` 传入 `isComplete` |
| 4 | `src/App.tsx` | 修改流程 | 两步确认：先确认结束 → 再确认是否生成传记 |
| 5 | `src/services/prompts.ts` | 修改模板 | `biographyPrompt()` 增加 `isComplete` 参数；`formatHistoryForBiography()` 增加 `isComplete` 参数 |
| 6 | `src/components/screens/GameScreen.tsx` | 修改文案 | 结束面板根据 `endReason` 显示不同文案 |
| 7 | `src/i18n/locales/zh-CN.json` | 新增文案 | 新增 8 条 i18n key |

---

## 五、流程对比

### 修改前

```
用户点击"结束旅程"
  → ConfirmModal: "确定要结束当前的旅程吗？你可以随时查看已生成的传记。"
  → 确认 → endGame() → 强制 generateBiography()
  → 切换到传记界面，开始流式生成
```

### 修改后

```
用户点击"结束旅程"
  → 第1步 ConfirmModal: "确定要结束当前的旅程吗？"
  → 确认 → session.isActive = false, endReason = 'player_ended'
  → 第2步 ConfirmModal: "是否现在生成专属传记？"
    → 是 → generateBiography(isComplete=false) → 传记以"未完待续"结尾
    → 否 → 留在游戏界面，显示"旅程已结束"面板 + "生成传记"按钮
  
LLM 自然结束（story_ending）:
  → session.isActive = false, endReason = 'story_ending'
  → 游戏界面显示"旅程已结束"面板
  → 用户手动点击"生成传记" → generateBiography(isComplete=true) → 完整传记
  
达到上限（max_choices / max_history）:
  → session.isActive = false, endReason = 'max_choices' 或 'max_history'
  → 同上，生成完整传记
```

---

## 六、风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| 旧版本会话数据无 `endReason` | 读取时 `undefined` | 默认视为完整结束（`isComplete = true`），向后兼容 |
| 数据库 `sessions` 表无 `end_reason` 列 | SQLite 写入失败 | 使用 JSON 序列化时自动忽略未知字段；后续可通过迁移脚本添加列 |
| LLM 可能忽略"未完待续"指令 | 传记仍可能编造后续 | 在提示词中加强约束，但 LLM 行为不可完全控制 |

---

## 七、数据库迁移（可选，后续）

当前 `endReason` 可作为 `session` JSON 的一部分存入 `scenarios_json` 或新增列。由于 `session` 整体序列化存储，无需立即迁移数据库表结构。后续如需查询过滤可按需添加：

```sql
ALTER TABLE sessions ADD COLUMN end_reason TEXT;
```

---

请确认以上方案，确认后开始开发。
