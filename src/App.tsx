import { useCallback, useEffect, useState } from 'react';
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
import StartupRecoveryScreen from './components/screens/StartupRecoveryScreen';
import DemoScreen from './components/screens/DemoScreen';
import { getStartupStatus, openDataFolder, type StartupStatus } from './services/startup';

function App() {
  const [startupStatus, setStartupStatus] = useState<StartupStatus | null>(null);
  const [continueDegraded, setContinueDegraded] = useState(false);
  const {
    currentScreen,
    isLoading,
    loadingText,
    error,
    showConfirmEnd,
    showConfirmBio,
    showSettings,
    showWorldManager,
    setError,
  } = useGameStore();

  const initializeApplication = useCallback(async () => {
    const store = useGameStore.getState();
    await store.loadSettings();
    await Promise.allSettled([
      store.loadConfig(),
      store.loadWorlds(),
      store.checkResume(),
    ]);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const status = await getStartupStatus();
        setStartupStatus(status);
        if (status.ready) await initializeApplication();
      } catch (startupError) {
        setStartupStatus({
          ready: false,
          degraded: true,
          dataDir: '',
          error: startupError instanceof Error ? startupError.message : String(startupError),
        });
      }
    })();
  }, [initializeApplication]);

  useEffect(() => {
    if (continueDegraded) void initializeApplication();
  }, [continueDegraded, initializeApplication]);

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
      case 'demo':
        return <DemoScreen />;
      default:
        return <StartScreen />;
    }
  };

  if (startupStatus && !startupStatus.ready && !continueDegraded) {
    return (
      <StartupRecoveryScreen
        status={startupStatus}
        onOpenDataFolder={openDataFolder}
        onContinueTemporarily={() => setContinueDegraded(true)}
      />
    );
  }

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
          message={`${error.message}\n\n诊断编号：${error.diagnosticId}`}
          onClose={() => setError(null)}
          onRetry={error.retryAction
            ? () => {
                const retry = error.retryAction;
                setError(null);
                void retry?.();
              }
            : undefined}
        />
      )}
      {showConfirmEnd && (
        <ConfirmModal
          title="结束旅程"
          message="确定要结束当前的旅程吗？"
          confirmText="结束旅程"
          cancelText="继续游戏"
          onConfirm={async () => {
            const store = useGameStore.getState();
            try {
              await store.endGame(false); // Persist the ended session before biography can start.
              store.setShowConfirmBio(true);
            } catch {
              // endGame has already published a user-facing persistence error.
            }
          }}
          onCancel={() => {
            useGameStore.getState().setShowConfirmEnd(false);
          }}
        />
      )}
      {showConfirmBio && (
        <ConfirmModal
          title="生成传记"
          message="旅程已结束。是否现在生成专属传记？"
          confirmText="生成传记"
          cancelText="返回主页"
          onConfirm={() => {
            useGameStore.getState().setShowConfirmBio(false);
            useGameStore.getState().generateBiography();
          }}
          onCancel={() => {
            useGameStore.getState().skipBiography();
          }}
        />
      )}
      {showSettings && <SettingsScreen degradedMode={continueDegraded} />}
      {showWorldManager && <WorldManagerScreen />}
    </div>
  );
}

export default App;
