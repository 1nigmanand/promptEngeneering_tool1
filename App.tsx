import React, { useState, useEffect, useCallback, useRef } from 'react';
import { login, signup, logout, getCurrentUser } from './services/authService';
import { ChallengeStatus, ChallengeProgress, User } from './types';
import { CHALLENGES } from './constants';
import { initializeAi } from './services/ApiService';
import { audioSources } from './services/audioService';
import { persistenceService, ProgressData } from './services/persistenceService';
import { firebaseIntegration } from './services/firebaseService';
import { logger } from './utils/Logger';
import AuthScreen from './components/AuthScreen';
import ChallengeHost from './components/ChallengeHost';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(getCurrentUser());
  const [isHidingAuth, setIsHidingAuth] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [challengeProgress, setChallengeProgress] = useState<Record<number, ChallengeProgress>>({});
  const [streakChange, setStreakChange] = useState<'increase' | 'decrease' | 'none'>('none');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const streakUpAudioRef = useRef<HTMLAudioElement>(null);
  const streakDownAudioRef = useRef<HTMLAudioElement>(null);
  const buttonClickAudioRef = useRef<HTMLAudioElement>(null);
  const loginAudioRef = useRef<HTMLAudioElement>(null);
  const levelCompleteAudioRef = useRef<HTMLAudioElement>(null);
  const scanningAudioRef = useRef<HTMLAudioElement>(null);
  const range0to25AudioRef = useRef<HTMLAudioElement>(null);
  const range26to50AudioRef = useRef<HTMLAudioElement>(null);
  const range51to80AudioRef = useRef<HTMLAudioElement>(null);
  const range81to100AudioRef = useRef<HTMLAudioElement>(null);


  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize Firebase first (only if not already initialized)
        if (!firebaseIntegration.isInitialized()) {
          try {
            await firebaseIntegration.initializeFromEnv();
            logger.info('FIREBASE_INITIALIZED_SUCCESS');
          } catch (firebaseError: any) {
            logger.warn('FIREBASE_INITIALIZATION_FAILED', {
              metadata: { error: firebaseError.message }
            });
            // Continue without Firebase - app will use localStorage fallback
          }
        }

        // Initialize AI Service (now handles multiple keys automatically)
        try {
          // The new ApiService initializes automatically with multiple keys
          setIsInitialized(true);
          logger.info('APPLICATION_INITIALIZED_SUCCESS');
        } catch (aiError: any) {
          setError(`Failed to initialize AI service: ${aiError.message}`);
          setIsInitialized(false);
          logger.error('AI_INITIALIZATION_FAILED', {
            metadata: { error: aiError.message }
          });
        }

        // Load user data if user is logged in
        const currentUser = getCurrentUser();
        if (currentUser) {
          await loadUserData(currentUser);
        } else {
          // Load default progress for non-authenticated users
          const defaultProgress = createDefaultProgress();
          setChallengeProgress(defaultProgress);
          setIsDataLoading(false);
        }

      } catch (error: any) {
        logger.error('APPLICATION_INITIALIZATION_FAILED', {
          metadata: { error: error.message }
        });
        setError(`Application initialization failed: ${error.message}`);
        setIsDataLoading(false);
      }
    };

    initializeApp();
  }, []);

  // Load user data from Firebase/localStorage
  const loadUserData = async (user: User) => {
    try {
      logger.debug('LOAD_USER_DATA_STARTED', { userId: user.email });
      setIsDataLoading(true);
      
      // Try to migrate localStorage data to Firebase if it exists
      if (firebaseIntegration.isInitialized()) {
        try {
          await persistenceService.migrateLocalStorageToFirebase(user.email);
        } catch (migrationError: any) {
          logger.warn('DATA_MIGRATION_FAILED', {
            userId: user.email,
            metadata: { error: migrationError.message }
          });
        }
      }

      // Load user progress
      const progressData = await persistenceService.loadProgress(user.email);
      if (progressData) {
        setChallengeProgress(progressData.challengeProgress);
      } else {
        setChallengeProgress(createDefaultProgress());
      }

      // Load user preferences (including mute state)
      const preferences = await persistenceService.loadPreferences(user.email);
      setIsMuted(preferences.isMuted);

      logger.info('USER_DATA_LOADED', {
        userId: user.email,
        metadata: { 
          hasProgress: !!progressData,
          isMuted: preferences.isMuted 
        }
      });

    } catch (error: any) {
      logger.error('USER_DATA_LOAD_FAILED', {
        userId: user.email,
        metadata: { error: error.message }
      });
      // Fallback to default data
      setChallengeProgress(createDefaultProgress());
    } finally {
      logger.debug('LOAD_USER_DATA_COMPLETED', { userId: user.email });
      setIsDataLoading(false);
    }
  };

  // Save progress changes to Firebase/localStorage
  useEffect(() => {
    const saveProgress = async () => {
      if (!user || Object.keys(challengeProgress).length === 0 || isDataLoading) {
        return;
      }

      try {
        const progressData: ProgressData = {
          challengeProgress,
          totalStreak: (Object.values(challengeProgress) as ChallengeProgress[]).reduce((sum: number, p: ChallengeProgress) => sum + (p?.streak || 0), 0),
          lastActivity: Date.now(),
          completedChallenges: Object.entries(challengeProgress)
            .filter(([_, progress]: [string, ChallengeProgress]) => progress.status === ChallengeStatus.COMPLETED)
            .map(([id, _]) => parseInt(id))
        };

        await persistenceService.saveProgress(user.email, progressData);
        
        logger.debug('PROGRESS_PERSISTED', {
          userId: user.email,
          metadata: { challengeCount: Object.keys(challengeProgress).length }
        });
      } catch (error: any) {
        logger.error('PROGRESS_PERSIST_FAILED', {
          userId: user?.email,
          metadata: { error: error.message }
        });
      }
    };

    // Debounce progress saving
    const timeoutId = setTimeout(saveProgress, 1000);
    return () => clearTimeout(timeoutId);
  }, [challengeProgress, user, isDataLoading]);

  // Save mute state changes
  useEffect(() => {
    const saveMuteState = async () => {
      if (!user) {
        return;
      }

      try {
        await persistenceService.saveMuteState(user.email, isMuted);
        logger.debug('MUTE_STATE_PERSISTED', {
          userId: user.email,
          metadata: { isMuted }
        });
      } catch (error: any) {
        logger.error('MUTE_STATE_PERSIST_FAILED', {
          userId: user.email,
          metadata: { error: error.message }
        });
      }
    };

    if (!isDataLoading) {
      saveMuteState();
    }
  }, [isMuted, user, isDataLoading]);

  // Helper function to create default progress
  const createDefaultProgress = (): Record<number, ChallengeProgress> => {
    const initialProgress: Record<number, ChallengeProgress> = {};
    CHALLENGES.forEach((challenge, index) => {
      initialProgress[challenge.id] = {
        status: index === 0 ? ChallengeStatus.UNLOCKED : ChallengeStatus.LOCKED,
        streak: 0,
        previousSimilarityScore: 0,
      };
    });
    return initialProgress;
  };

  // Simplified main audio control
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    audioElement.loop = true;
    audioElement.volume = 0.3;

    const syncPlayback = () => {
      if (!isMuted && document.visibilityState === 'visible') {
        audioElement.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.warn("Autoplay was prevented. User interaction is needed.");
          }
        });
      } else {
        audioElement.pause();
      }
    };
    
    syncPlayback(); // Attempt to play on mount / mute change
    document.addEventListener('visibilitychange', syncPlayback);

    return () => {
      document.removeEventListener('visibilitychange', syncPlayback);
    };
  }, [isMuted]);

  // Control mute state for all SFX audio elements
  useEffect(() => {
    if (streakUpAudioRef.current) streakUpAudioRef.current.muted = isMuted;
    if (streakDownAudioRef.current) streakDownAudioRef.current.muted = isMuted;
    if (buttonClickAudioRef.current) buttonClickAudioRef.current.muted = isMuted;
    if (loginAudioRef.current) loginAudioRef.current.muted = isMuted;
    if (levelCompleteAudioRef.current) levelCompleteAudioRef.current.muted = isMuted;
    if (scanningAudioRef.current) scanningAudioRef.current.muted = isMuted;
    if (range0to25AudioRef.current) range0to25AudioRef.current.muted = isMuted;
    if (range26to50AudioRef.current) range26to50AudioRef.current.muted = isMuted;
    if (range51to80AudioRef.current) range51to80AudioRef.current.muted = isMuted;
    if (range81to100AudioRef.current) range81to100AudioRef.current.muted = isMuted;
  }, [isMuted]);

  // Play streak sound effects
  useEffect(() => {
    if (streakChange === 'increase') {
      streakUpAudioRef.current?.play().catch(console.warn);
    } else if (streakChange === 'decrease') {
      streakDownAudioRef.current?.play().catch(console.warn);
    }
    if (streakChange !== 'none') {
      const timer = setTimeout(() => setStreakChange('none'), 1000);
      return () => clearTimeout(timer);
    }
  }, [streakChange]);

  // Global click sound handler
  useEffect(() => {
    const playSound = () => {
      if (buttonClickAudioRef.current) {
        buttonClickAudioRef.current.currentTime = 0;
        buttonClickAudioRef.current.play().catch(console.warn);
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (audioRef.current && audioRef.current.paused && !isMuted) {
        audioRef.current.play().catch(console.warn);
      }
      if (event.target instanceof HTMLElement && event.target.closest('button, [role="button"], select, a')) {
        playSound();
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [isMuted]);

  const handleAuthSuccess = async (loggedInUser: User) => {
    try {
      loginAudioRef.current?.play().catch(console.warn);
      setIsHidingAuth(true);
      
      // Load user data in the background
      setTimeout(async () => {
        setUser(loggedInUser);
        await loadUserData(loggedInUser);
        setIsHidingAuth(false);
      }, 1000);
    } catch (error: any) {
      logger.error('AUTH_SUCCESS_HANDLER_FAILED', {
        userId: loggedInUser.email,
        metadata: { error: error.message }
      });
      setIsHidingAuth(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    const loggedInUser = await login(email, password);
    handleAuthSuccess(loggedInUser);
  };

  const handleSignup = async (email: string, password: string) => {
    const signedUpUser = await signup(email, password);
    handleAuthSuccess(signedUpUser);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      
      // Reset to default state
      setChallengeProgress(createDefaultProgress());
      setIsMuted(false);
      setIsDataLoading(false);
      
      logger.info('USER_LOGGED_OUT_SUCCESS');
    } catch (error: any) {
      logger.error('LOGOUT_FAILED', {
        metadata: { error: error.message }
      });
    }
  };

  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    
    // Imperatively play/pause to ensure user interaction unlocks audio
    if (audioRef.current) {
        if (nextMuted) {
            audioRef.current.pause();
        } else {
            // This play() call is triggered by a user click, so it should bypass autoplay restrictions.
            audioRef.current.play().catch(e => console.warn("Could not play audio:", e));
        }
    }
  }, [isMuted]);

  const pauseBgMusic = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resumeBgMusic = useCallback(() => {
    if (!isMuted) {
      audioRef.current?.play().catch(console.warn);
    }
  }, [isMuted]);

  const playSimilarityScoreSound = useCallback((score: number): Promise<void> => {
    let audio: HTMLAudioElement | null = null;
    if (score >= 0 && score <= 25) {
        audio = range0to25AudioRef.current;
    } else if (score >= 26 && score <= 50) {
        audio = range26to50AudioRef.current;
    } else if (score >= 51 && score <= 80) {
        audio = range51to80AudioRef.current;
    } else if (score >= 81 && score <= 100) {
        audio = range81to100AudioRef.current;
    }

    if (audio) {
        pauseBgMusic();
        audio.currentTime = 0;
        return new Promise((resolve) => {
            const handleEnded = () => {
                audio?.removeEventListener('ended', handleEnded);
                resumeBgMusic();
                resolve();
            };
            audio.addEventListener('ended', handleEnded);
            audio.play().catch(err => {
                console.warn('Score sound playback failed:', err);
                audio?.removeEventListener('ended', handleEnded);
                resumeBgMusic(); // Resume music even if sound fails to play
                resolve();
            });
        });
    }

    return Promise.resolve(); // No sound to play
  }, [pauseBgMusic, resumeBgMusic]);

  const playLevelCompleteSound = useCallback(() => {
    levelCompleteAudioRef.current?.play().catch(console.warn);
  }, []);
  
  const playScanningSound = useCallback(() => {
    scanningAudioRef.current?.play().catch(console.warn);
  }, []);

  const stopScanningSound = useCallback(() => {
    if (scanningAudioRef.current) {
        scanningAudioRef.current.pause();
        scanningAudioRef.current.currentTime = 0;
    }
  }, []);

  if (!isInitialized || isDataLoading) {
    // Debug logging to understand loading state
    logger.debug('SHOWING_LOADING_SCREEN', {
      metadata: { 
        isInitialized, 
        isDataLoading,
        user: !!user 
      }
    });
    
    return (
      <div className="fixed inset-0 bg-cyber-bg flex flex-col items-center justify-center text-cyber-dim p-4">
        {error ? (
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-display text-red-500">INITIALIZATION FAILED</h1>
            <p className="max-w-md bg-cyber-surface p-4 border border-red-500 rounded-md">{error}</p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <Spinner />
            <p className="text-cyber-primary animate-flicker">
              {!isInitialized ? 'INITIALIZING INTERFACE...' : 'LOADING USER DATA...'}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <audio ref={audioRef} src={audioSources.backgroundMusic} loop />
      <audio ref={streakUpAudioRef} src={audioSources.streakUp} />
      <audio ref={streakDownAudioRef} src={audioSources.streakDown} />
      <audio ref={buttonClickAudioRef} src={audioSources.buttonClick} />
      <audio ref={loginAudioRef} src={audioSources.loginSound} />
      <audio ref={levelCompleteAudioRef} src={audioSources.levelComplete} />
      <audio ref={scanningAudioRef} src={audioSources.scanningSound} loop />
      <audio ref={range0to25AudioRef} src={audioSources.range0to25} />
      <audio ref={range26to50AudioRef} src={audioSources.range26to50} />
      <audio ref={range51to80AudioRef} src={audioSources.range51to80} />
      <audio ref={range81to100AudioRef} src={audioSources.range81to100} />
      
      {!user ? (
        <AuthScreen onLogin={handleLogin} onSignup={handleSignup} isHiding={isHidingAuth} />
      ) : (
        <ChallengeHost
          user={user}
          onLogout={handleLogout}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          challengeProgress={challengeProgress}
          setChallengeProgress={setChallengeProgress}
          streakChange={streakChange}
          setStreakChange={setStreakChange}
          onPauseBgMusic={pauseBgMusic}
          onResumeBgMusic={resumeBgMusic}
          onPlaySimilarityScoreSound={playSimilarityScoreSound}
          onPlayLevelCompleteSound={playLevelCompleteSound}
          onPlayScanningSound={playScanningSound}
          onStopScanningSound={stopScanningSound}
        />
      )}
    </>
  );
};

export default App;
