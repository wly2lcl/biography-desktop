import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';

const DEMO_SCENES = [
  {
    title: '雨夜入城',
    description: '暮雨落在青石长街上。你怀里那封没有署名的信，只写着一句：子时之前，到听雪楼顶层。远处更鼓响起，城门正在缓缓关闭。',
    choices: ['赶往听雪楼', '先调查送信人'],
  },
  {
    title: '灯下旧识',
    description: '楼中只亮着一盏灯。多年未见的故人坐在窗前，将一枚刻着你家纹的玉佩推到桌边。窗外忽然传来瓦片碎裂的轻响。',
    choices: ['相信故人', '追查窗外来客'],
  },
  {
    title: '命运的第一笔',
    description: '你的选择让沉寂多年的旧案重新浮出水面。今晚之后，江湖会记住一个新的名字，而这段旅程才刚刚开始。',
    choices: [],
  },
] as const;

export default function DemoScreen() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const { setScreen, setShowSettings } = useGameStore();
  const scene = DEMO_SCENES[sceneIndex];
  const demoBiography = useMemo(
    () => `你在雨夜踏入城中，因${choices.join('、') || '尚未作出的选择'}卷入一桩尘封旧案。命运的篇章已经展开，但真正的故事仍等待你亲手书写。`,
    [choices]
  );

  const choose = (choice: string) => {
    setChoices((previous) => [...previous, choice]);
    setSceneIndex((previous) => Math.min(previous + 1, DEMO_SCENES.length - 1));
  };

  return (
    <div className="w-full h-full bg-dark-950 overflow-y-auto p-6 sm:p-10">
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-primary-400 mb-1">离线静态示例 · 不发送任何数据</p>
            <h1 className="text-2xl font-serif text-primary-300">听雪楼来信</h1>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={() => setScreen('start')}>
            返回主页
          </button>
        </div>

        <div className="glass-panel p-6 sm:p-8">
          <p className="text-xs text-gray-500 mb-3">第 {sceneIndex + 1} / {DEMO_SCENES.length} 幕</p>
          <h2 className="text-xl text-gray-100 mb-4">{scene.title}</h2>
          <p className="text-gray-300 leading-8 whitespace-pre-wrap">{scene.description}</p>
        </div>

        {scene.choices.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {scene.choices.map((choice) => (
              <button key={choice} type="button" className="card-base text-left" onClick={() => choose(choice)}>
                <span className="text-primary-300">{choice}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="glass-panel p-6 space-y-4">
            <h2 className="text-lg font-serif text-primary-300">【无名侠客·未完待续】</h2>
            <p className="text-gray-300 leading-7">{demoBiography}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" className="btn-primary" onClick={() => setShowSettings(true)}>
                配置模型，开始真实旅程
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setSceneIndex(0); setChoices([]); }}
              >
                重新体验
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
