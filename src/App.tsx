import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import StartScreen from './components/screens/StartScreen';
import SystemScreen from './components/screens/SystemScreen';
import GameScreen from './components/screens/GameScreen';
import BiographyScreen from './components/screens/BiographyScreen';
import SettingsScreen from './components/screens/SettingsScreen';
import WorldManagerScreen from './components/screens/WorldManagerScreen';
import LoadingOverlay from './components/common/LoadingOverlay';
import ErrorModal from './components/common/ErrorModal';
import ConfirmModal from './components/common/ConfirmModal';

function App() {
  const {
    currentScreen,
    isLoading,
    loadingText,
    error,
    showConfirmEnd,
    showSettings,
    showWorldManager,
    setError,
  } = useGameStore();

  // Initialize app on mount
  useEffect(() => {
    const init = async () => {
      const store = useGameStore.getState();
      await Promise.allSettled([
        store.loadSettings(),
        store.loadConfig(),
        store.loadWorlds(),
        store.checkResume(),
      ]);
    };
    init();
  }, []);

  useEffect(() => {
    if (error) {
      // Error will be shown via ErrorModal
    }
  }, [error]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'start':
        return <StartScreen />;
      case 'system':
        return <SystemScreen />;
      case 'game':
        return <GameScreen />;
      case 'biography':
        return <BiographyScreen />;
      default:
        return <StartScreen />;
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Main content */}
      <div className={`w-full h-full transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
        {renderScreen()}
      </div>

      {/* Overlays */}
      {isLoading && <LoadingOverlay text={loadingText} />}
      {error && (
        <ErrorModal
          message={error}
          onClose={() => setError(null)}
          onRetry={() => {
            setError(null);
            // Retry logic handled by caller
          }}
        />
      )}
      {showConfirmEnd && (
        <ConfirmModal
          title="结束旅程"
          message="确定要结束当前的旅程吗？你可以随时查看已生成的传记。"
          confirmText="结束旅程"
          cancelText="继续游戏"
          onConfirm={() => {
            useGameStore.getState().endGame();
          }}
          onCancel={() => {
            useGameStore.getState().setShowConfirmEnd(false);
          }}
        />
      )}
      {showSettings && <SettingsScreen />}
      {showWorldManager && <WorldManagerScreen />}
    </div>
  );
}

export default App;
