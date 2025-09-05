import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Challenge, ChallengeStatus, AnalysisResult, ChallengeProgress, ImageService, User } from '../types';
import { CHALLENGES, PASS_THRESHOLD } from '../constants';
import ChallengeSelector from './ChallengeSelector';
import ChallengeView from './ChallengeView';
import { generateImage } from '../services/ApiService';
import { analyzeImages } from '../services/analysisService';
import Header from './Header';
import MobileMenu from './MobileMenu';
import Spinner from './Spinner';

interface ChallengeHostProps {
  user: User;
  onLogout: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  challengeProgress: Record<number, ChallengeProgress>;
  setChallengeProgress: React.Dispatch<React.SetStateAction<Record<number, ChallengeProgress>>>;
  streakChange: 'increase' | 'decrease' | 'none';
  setStreakChange: React.Dispatch<React.SetStateAction<'increase' | 'decrease' | 'none'>>;
  onPauseBgMusic: () => void;
  onResumeBgMusic: () => void;
  onPlaySimilarityScoreSound: (score: number) => Promise<void>;
  onPlayLevelCompleteSound: () => void;
  onPlayScanningSound: () => void;
  onStopScanningSound: () => void;
}

const ChallengeHost: React.FC<ChallengeHostProps> = ({
  user,
  onLogout,
  isMuted,
  onToggleMute,
  challengeProgress,
  setChallengeProgress,
  streakChange,
  setStreakChange,
  onPauseBgMusic,
  onResumeBgMusic,
  onPlaySimilarityScoreSound,
  onPlayLevelCompleteSound,
  onPlayScanningSound,
  onStopScanningSound,
}) => {
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState<number>(0);
  const [prompt, setPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ImageService>('gemini-imagen-3');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncChallengeIndexOnProgressChange = useRef(true);
  const analysisResultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Set challenge based on progress, but only on initial load or manual file load.
    if (syncChallengeIndexOnProgressChange.current && challengeProgress && Object.keys(challengeProgress).length > 0) {
      const statuses = CHALLENGES.map(c => challengeProgress[c.id]?.status);
      const lastCompleted = statuses.lastIndexOf(ChallengeStatus.COMPLETED);
      const nextChallenge = lastCompleted + 1;
      setCurrentChallengeIndex(nextChallenge < CHALLENGES.length ? nextChallenge : lastCompleted > -1 ? lastCompleted : 0);
      // After syncing, disable it until it's explicitly enabled again (e.g., by file load)
      syncChallengeIndexOnProgressChange.current = false;
    }
  }, [challengeProgress]);

  useEffect(() => {
    if (analysisResult && analysisResultRef.current) {
        analysisResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [analysisResult]);

  const handleSaveProgress = () => {
    try {
      if (!challengeProgress || Object.keys(challengeProgress).length === 0) {
        alert("No progress data to save.");
        return;
      }
      
      const getUserName = (email: string): string => {
        const namePart = email.split('@')[0];
        return namePart.split('.')[0].charAt(0).toUpperCase() + namePart.split('.')[0].slice(1);
      };
      const userName = getUserName(user.email);

      let latestUnlockedChallengeId = 1;
      for (let i = CHALLENGES.length - 1; i >= 0; i--) {
        const challenge = CHALLENGES[i];
        if (challengeProgress[challenge.id]?.status !== ChallengeStatus.LOCKED) {
          latestUnlockedChallengeId = challenge.id;
          break;
        }
      }
      
      const today = new Date();
      const day = today.getDate();
      const month = today.toLocaleString('en-US', { month: 'short' });
      const formattedDate = `${day}_${month}`;

      const filename = `${userName}_challenge_${latestUnlockedChallengeId}_${formattedDate}.json`;
      
      const progressData = JSON.stringify(challengeProgress, null, 2);
      const blob = new Blob([progressData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to save progress:", error);
      alert("An error occurred while saving progress.");
    }
  };

  const handleLoadProgressClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("Failed to read file content.");

        const loadedProgressJson: Record<string, ChallengeProgress> = JSON.parse(text);

        if (typeof loadedProgressJson !== 'object' || loadedProgressJson === null) {
          throw new Error("Invalid progress file: data is not a valid JSON object.");
        }

        const newProgress: Record<number, ChallengeProgress> = {};
        for (const key in loadedProgressJson) {
          const challengeId = parseInt(key, 10);
          if (isNaN(challengeId) || !CHALLENGES.find(c => c.id === challengeId)) continue;

          const progressItem = loadedProgressJson[key];
          if (!progressItem || !Object.values(ChallengeStatus).includes(progressItem.status)) {
            throw new Error(`Data for challenge ${key} is malformed.`);
          }
          newProgress[challengeId] = progressItem;
        }

        // Enable challenge index sync before setting new progress
        syncChallengeIndexOnProgressChange.current = true;
        setChallengeProgress(newProgress);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        alert(`Failed to load progress file. Details: ${errorMessage}`);
      } finally {
        if (event.target) event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateAndAnalyze = useCallback(async () => {
    if (!prompt) {
      setError("Prompt cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    setGeneratedImage(null);
    onPlayScanningSound();

    const currentChallenge = CHALLENGES[currentChallengeIndex];

    try {
      setLoadingMessage('SYNTHESIZING IMAGE...');
      const imageB64 = await generateImage(prompt, selectedService, user.email);
      
      // Both Pollinations and Gemini services return complete data URLs
      // No need to add prefix as it's already included
      setGeneratedImage(imageB64);

      setLoadingMessage('ANALYZING RESULTS...');
      // Extract raw base64 for analysis service
      const rawBase64 = imageB64.split(',')[1];
      
      const result = await analyzeImages(user, currentChallenge, rawBase64, prompt);
      
      // Update Firebase with the actual similarity score
      try {
        const { firebaseIntegration } = await import('../services/firebaseService');
        if (firebaseIntegration.isInitialized()) {
          // Find the most recent request to update (this is a simple approach)
          // In a more robust implementation, you'd pass the requestId through the pipeline
          const recentRequests = await firebaseIntegration.getUserRequests(user.email, 1);
          if (recentRequests && recentRequests.length > 0) {
            const requestId = recentRequests[0].requestId;
            // Update the similarity score in Firestore
            await firebaseIntegration.updateUserRequestScore(user.email, requestId, result.similarityScore);
          }
        }
      } catch (firebaseError) {
        console.warn('Failed to update similarity score in Firebase:', firebaseError);
        // Don't block the UI if Firebase update fails
      }
      
      onStopScanningSound();
      setAnalysisResult(result);

      const currentProgress = challengeProgress[currentChallenge.id];
      const newSimilarityScore = result.similarityScore;
      const oldSimilarityScore = currentProgress.previousSimilarityScore;
      const passed = newSimilarityScore >= PASS_THRESHOLD;
      const justCompleted = passed && currentProgress.status !== ChallengeStatus.COMPLETED;

      let streakChanged: 'increase' | 'decrease' | 'none' = 'none';
      if (newSimilarityScore > oldSimilarityScore) {
        streakChanged = 'increase';
      } else if (newSimilarityScore < oldSimilarityScore) {
        streakChanged = 'decrease';
      }

      setChallengeProgress(prev => {
        const newProgress = { ...prev };
        const challengeId = currentChallenge.id;

        let newStreak = prev[challengeId].streak;
        if (streakChanged === 'increase') {
          newStreak++;
        } else if (streakChanged === 'decrease') {
          newStreak = Math.max(0, newStreak - 2);
        }

        newProgress[challengeId] = {
          streak: newStreak,
          previousSimilarityScore: newSimilarityScore,
          status: passed ? ChallengeStatus.COMPLETED : prev[challengeId].status,
        };

        if (passed && currentChallengeIndex + 1 < CHALLENGES.length) {
          const nextChallengeId = CHALLENGES[currentChallengeIndex + 1].id;
          if (newProgress[nextChallengeId].status === ChallengeStatus.LOCKED) {
            newProgress[nextChallengeId].status = ChallengeStatus.UNLOCKED;
          }
        }
        return newProgress;
      });

      // --- Audio Orchestration ---
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      // 1. Play similarity meter sound. This now handles pause/resume of bg music.
      await onPlaySimilarityScoreSound(result.similarityScore);

      // 2. Play streak sound (if any) and wait
      if (streakChanged !== 'none') {
        setStreakChange(streakChanged);
        await delay(700);
      }

      // 3. Play level complete sound (if applicable) and wait
      if (justCompleted) {
        onPlayLevelCompleteSound();
        await delay(2500);
      }

    } catch (err: any) {
      onStopScanningSound(); // Also stop on error
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [
    prompt, currentChallengeIndex, selectedService, challengeProgress, user,
    setChallengeProgress, setStreakChange, onPauseBgMusic, onResumeBgMusic,
    onPlaySimilarityScoreSound, onPlayLevelCompleteSound, onPlayScanningSound, onStopScanningSound
  ]);

  const handleSelectChallenge = (index: number) => {
    const challengeId = CHALLENGES[index].id;
    if (challengeProgress[challengeId]?.status !== ChallengeStatus.LOCKED) {
      setCurrentChallengeIndex(index);
      setPrompt('');
      setGeneratedImage(null);
      setAnalysisResult(null);
      setError(null);
    }
  };

  const handleNextChallenge = () => {
    const nextIndex = currentChallengeIndex + 1;
    if (nextIndex < CHALLENGES.length) {
      handleSelectChallenge(nextIndex);
    }
  };

  const currentChallenge = CHALLENGES[currentChallengeIndex];
  const currentChallengeSpecificProgress = challengeProgress[currentChallenge?.id];
  const challengeStatuses = CHALLENGES.map(c => challengeProgress[c.id]?.status || ChallengeStatus.LOCKED);

  if (!currentChallengeSpecificProgress) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="min-h-screen font-sans animate-fade-in flex flex-col h-screen">
      <Header
        user={user}
        onLogout={onLogout}
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        streak={currentChallengeSpecificProgress.streak}
        streakChange={streakChange}
        selectedService={selectedService}
        onServiceChange={setSelectedService}
        onSaveProgress={handleSaveProgress}
        onLoadProgressClick={handleLoadProgressClick}
        onOpenMenu={() => setIsMenuOpen(true)}
      />

      <MobileMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        user={user}
        onLogout={onLogout}
        onSaveProgress={handleSaveProgress}
        onLoadProgressClick={handleLoadProgressClick}
        challenges={CHALLENGES}
        statuses={challengeStatuses}
        currentChallengeId={currentChallenge.id}
        onSelectChallenge={handleSelectChallenge}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileLoad}
        accept="application/json,.json"
        className="hidden"
      />

      <main className="relative z-0 flex flex-col md:flex-row p-4 md:p-8 gap-8 flex-1 overflow-hidden">
        <aside className="hidden md:block w-full md:w-1/4 lg:w-1/5 h-full">
          <ChallengeSelector
            challenges={CHALLENGES}
            statuses={challengeStatuses}
            currentChallengeId={currentChallenge.id}
            onSelectChallenge={handleSelectChallenge}
          />
        </aside>
        <div className="flex-1 overflow-y-auto">
          {currentChallenge && (
            <ChallengeView
              challenge={currentChallenge}
              prompt={prompt}
              onPromptChange={setPrompt}
              onGenerate={handleGenerateAndAnalyze}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
              generatedImage={generatedImage}
              analysisResult={analysisResult}
              error={error}
              onNextChallenge={handleNextChallenge}
              isPassed={!!analysisResult && analysisResult.similarityScore >= PASS_THRESHOLD}
              isNextChallengeAvailable={currentChallengeIndex + 1 < CHALLENGES.length}
              previousSimilarityScore={currentChallengeSpecificProgress.previousSimilarityScore}
              analysisResultRef={analysisResultRef}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default ChallengeHost;