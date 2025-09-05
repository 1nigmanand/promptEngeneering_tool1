import React, { useState, useEffect } from 'react';
import { Challenge, AnalysisResult } from '../types';
import Spinner from './Spinner';
import { getLocalImageAsBlobUrl } from '../services/ApiService';
import SimilarityMeter from './SimilarityMeter';

interface ChallengeViewProps {
  challenge: Challenge;
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  loadingMessage: string;
  generatedImage: string | null;
  analysisResult: AnalysisResult | null;
  error: string | null;
  onNextChallenge: () => void;
  isPassed: boolean;
  isNextChallengeAvailable: boolean;
  previousSimilarityScore: number;
  analysisResultRef: React.RefObject<HTMLDivElement>;
}

const HudFrame: React.FC<{ children: React.ReactNode; title: string }> = ({ children, title }) => (
    <div className="space-y-2">
        <h3 className="text-lg font-display font-bold text-center text-cyber-primary tracking-widest uppercase">{title}</h3>
        <div className="aspect-square bg-cyber-bg p-1 relative rounded-md">
            <div className="absolute inset-0 border-2 border-cyber-primary/30 rounded-md animate-border-flicker"></div>
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                {children}
            </div>
             {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyber-primary animate-pulse-corners"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyber-primary animate-pulse-corners"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyber-primary animate-pulse-corners"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyber-primary animate-pulse-corners"></div>
        </div>
    </div>
);

const ChallengeView: React.FC<ChallengeViewProps> = ({
  challenge,
  prompt,
  onPromptChange,
  onGenerate,
  isLoading,
  loadingMessage,
  generatedImage,
  analysisResult,
  error,
  onNextChallenge,
  isPassed,
  isNextChallengeAvailable,
  previousSimilarityScore,
  analysisResultRef,
}) => {
  const [targetImageSrc, setTargetImageSrc] = useState<string | null>(null);
  
  // 🎯 Phase management for step-by-step process
  const [currentPhase, setCurrentPhase] = useState<'input' | 'generating' | 'image-ready' | 'evaluating' | 'complete'>('input');
  const [showEvaluationAnimation, setShowEvaluationAnimation] = useState(false);

  // Reset phase when new challenge starts
  useEffect(() => {
    setCurrentPhase('input');
    setShowEvaluationAnimation(false);
  }, [challenge.id]);

  // Handle phase transitions based on props
  useEffect(() => {
    if (isLoading && loadingMessage.includes('SYNTHESIZING')) {
      // Only set to generating phase for image synthesis
      setCurrentPhase('generating');
      setShowEvaluationAnimation(false);
    } else if (isLoading && loadingMessage.includes('ANALYZING')) {
      // Analysis phase - keep image visible with overlay
      setCurrentPhase('evaluating');
      setShowEvaluationAnimation(true);
    } else if (generatedImage && !analysisResult && !isLoading) {
      // Image is ready, show it immediately 
      setCurrentPhase('image-ready');
      // Then start evaluation after a brief moment to let user see the image
      const timer = setTimeout(() => {
        setCurrentPhase('evaluating');
        setShowEvaluationAnimation(true);
      }, 300); // Show image clearly for 0.3 seconds first
      return () => clearTimeout(timer);
    } else if (analysisResult && !isLoading) {
      // 🎯 Analysis complete and loading stopped - stop animation first, then show feedback
      setShowEvaluationAnimation(false);
      const timer = setTimeout(() => {
        setCurrentPhase('complete');
      }, 300); // Give enough time for animation to stop gracefully
      return () => clearTimeout(timer);
    }
  }, [isLoading, loadingMessage, generatedImage, analysisResult]);

  useEffect(() => {
    let objectUrl: string | null = null;
    
    const loadImage = async () => {
      setTargetImageSrc(null); // Show loading state
      const blobUrl = await getLocalImageAsBlobUrl(challenge.imageUrl);
      
      if (blobUrl.startsWith('blob:')) {
        objectUrl = blobUrl;
      }
      setTargetImageSrc(blobUrl);
    };

    loadImage();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [challenge.imageUrl]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-3xl font-display font-bold text-white tracking-wider">{`CHALLENGE ${challenge.id}: ${challenge.name}`}</h2>
        <p className="text-cyber-dim mt-1 font-sans">{challenge.description}</p>
      </div>

      <div className="relative">
        <div className="pr-16 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HudFrame title="TARGET">
                 {targetImageSrc ? (
                  <img src={targetImageSrc} alt="Target for the challenge" className="w-full h-full object-cover" />
                ) : (
                  <Spinner />
                )}
            </HudFrame>
            <HudFrame title="GENERATION">
                {currentPhase === 'generating' ? (
                  <div className="text-center">
                    <Spinner />
                    <p className="mt-2 text-cyber-primary animate-flicker font-bold tracking-widest">{loadingMessage}</p>
                  </div>
                ) : currentPhase === 'image-ready' ? (
                  <div className="relative">
                    <img src={generatedImage} alt="AI generated image" className="w-full h-full object-cover animate-fade-in" />
                    <div className="absolute inset-0 bg-cyber-primary/10 animate-pulse-once"></div>
                    <div className="absolute bottom-2 left-2 right-2 text-center">
                      <p className="text-cyber-primary font-bold tracking-widest animate-flicker">IMAGE GENERATED</p>
                    </div>
                  </div>
                ) : currentPhase === 'evaluating' ? (
                  <div className="relative">
                    <img src={generatedImage} alt="AI generated image" className="w-full h-full object-cover" />
                    {showEvaluationAnimation && (
                      <div className="absolute inset-0">
                        {/* Scanning overlay with moving lines */}
                        <div className="absolute inset-0 bg-cyber-bg/60 flex items-center justify-center">
                          {/* Horizontal scanning lines */}
                          <div className="absolute inset-0 overflow-hidden">
                            <div className="absolute w-full h-0.5 bg-cyber-accent shadow-lg shadow-cyber-accent/50 animate-evaluation-scan"></div>
                            <div className="absolute w-full h-0.5 bg-cyber-accent/60 shadow-lg shadow-cyber-accent/30 animate-evaluation-scan" style={{ animationDelay: '1s' }}></div>
                          </div>
                          
                          {/* Vertical scanning grid */}
                          <div className="absolute inset-0 opacity-30">
                            <div className="grid-scan-overlay"></div>
                          </div>
                          
                          {/* Center analysis indicator */}
                          <div className="relative z-10 text-center space-y-4">
                            <div className="relative">
                              {/* Rotating scanner ring */}
                              <div className="w-16 h-16 border-4 border-transparent border-t-cyber-accent border-r-cyber-accent animate-spin rounded-full mx-auto"></div>
                              <div className="absolute inset-0 w-16 h-16 border-2 border-cyber-accent/30 rounded-full mx-auto animate-pulse"></div>
                            </div>
                            
                            <div className="space-y-2">
                              <p className="text-cyber-accent font-bold tracking-widest animate-pulse text-lg">
                                SCANNING IMAGE
                              </p>
                              <p className="text-cyber-primary font-bold tracking-wider animate-flicker text-sm">
                                EVALUATING SIMILARITY...
                              </p>
                            </div>
                            
                            {/* Progress dots */}
                            <div className="flex justify-center space-x-2">
                              <div className="w-2 h-2 bg-cyber-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-2 h-2 bg-cyber-accent rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                              <div className="w-2 h-2 bg-cyber-accent rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
                              <div className="w-2 h-2 bg-cyber-accent rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
                            </div>
                          </div>
                          
                          {/* Corner scan indicators */}
                          <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-cyber-accent animate-pulse"></div>
                          <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-cyber-accent animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                          <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-cyber-accent animate-pulse" style={{ animationDelay: '1s' }}></div>
                          <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-cyber-accent animate-pulse" style={{ animationDelay: '1.5s' }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : generatedImage ? (
                  <img src={generatedImage} alt="AI generated image" className="w-full h-full object-cover" />
                ) : (
                  <p className="text-cyber-dim">Awaiting image synthesis...</p>
                )}
            </HudFrame>
          </div>

          <div className="space-y-4">
            <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  placeholder="Enter prompt here..."
                  className="w-full h-28 p-3 bg-cyber-surface/80 rounded-md border-2 border-cyber-secondary/50 focus:border-cyber-secondary focus:ring-2 focus:ring-cyber-secondary/50 focus:outline-none transition-all text-cyber-text placeholder:text-cyber-dim font-sans"
                  disabled={currentPhase === 'generating' || currentPhase === 'evaluating'}
                />
                {currentPhase === 'generating' && (
                  <div className="absolute inset-0 rounded-md overflow-hidden pointer-events-none">
                    <div className="scanner-bar"></div>
                  </div>
                )}
            </div>
            <button
              onClick={onGenerate}
              disabled={currentPhase === 'generating' || currentPhase === 'evaluating' || !prompt}
              className="glitch-button w-full py-3 px-6 bg-cyber-primary text-cyber-bg font-bold text-lg rounded-md transition-all duration-300 disabled:bg-cyber-dim disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 hover:shadow-lg hover:shadow-cyber-primary/50"
              data-text={
                currentPhase === 'generating' ? 'GENERATING...' : 
                currentPhase === 'evaluating' ? 'EVALUATING...' : 
                'GENERATE & ANALYZE'
              }
            >
              {currentPhase === 'generating' ? 'GENERATING...' : 
               currentPhase === 'evaluating' ? 'EVALUATING...' : 
               'GENERATE & ANALYZE'}
            </button>
            {error && <p className="text-red-400 text-center">{error}</p>}
          </div>
        </div>

        <SimilarityMeter score={analysisResult?.similarityScore ?? previousSimilarityScore} />
      </div>


      {analysisResult && currentPhase === 'complete' && (
        <div ref={analysisResultRef} className="bg-cyber-surface/70 p-6 rounded-lg border-2 border-cyber-primary/30 animate-slide-in-up space-y-6">
          <h3 className="text-2xl font-display font-bold text-white tracking-wider">ANALYSIS RESULT</h3>
          
          <div className="text-center py-6 bg-cyber-bg/50 rounded-md border border-cyber-dim/20">
            <div className="flex flex-col items-center justify-center">
              {analysisResult.similarityScore > previousSimilarityScore && previousSimilarityScore > 0 && (
                <div className="text-cyber-accent animate-fade-in space-y-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                  <p className="font-bold text-2xl font-display tracking-widest">STREAK +1</p>
                </div>
              )}
              {analysisResult.similarityScore < previousSimilarityScore && (
                <div className="text-red-500 animate-fade-in space-y-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                  <p className="font-bold text-2xl font-display tracking-widest">STREAK -2</p>
                </div>
              )}
              {analysisResult.similarityScore === previousSimilarityScore && previousSimilarityScore > 0 && (
                <div className="text-cyber-dim animate-fade-in space-y-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" /></svg>
                  <p className="font-bold text-2xl font-display tracking-widest">STREAK UNCHANGED</p>
                </div>
              )}
               {previousSimilarityScore === 0 && (
                <div className="text-cyber-dim animate-fade-in">
                   <p className="font-bold text-2xl font-display tracking-widest">FIRST ATTEMPT</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-2">
            <h4 className="text-lg font-bold text-cyber-accent uppercase tracking-wider">Feedback Log</h4>
            
            <ol className="list-decimal list-inside text-cyber-text space-y-2 mt-2 font-sans">
              {analysisResult.feedback.map((item, index) => (
                <li 
                  key={index} 
                  className="border-b border-cyber-dim/20 pb-1"
                >
                  {item}
                </li>
                
              ))}
            </ol>
          </div>

          {isPassed && (
            <div className="pt-4 text-center border-t border-cyber-primary/30">
              <p className="text-4xl font-display font-bold text-cyber-accent drop-shadow-[0_0_10px_#00ff7f]">
                CHALLENGE PASSED
              </p>
              <p className="text-cyber-text font-bold text-lg mb-4">Mission parameters met. Well done, agent.</p>
              
              <div className="mt-4 p-3 bg-cyber-bg/50 rounded-md border border-cyber-dim/30 flex items-center justify-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyber-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm text-cyber-dim">
                    Remember to save your progress via the user menu (top-right).
                </p>
              </div>

              {isNextChallengeAvailable ? (
                <button
                  onClick={onNextChallenge}
                  className="mt-4 py-2 px-6 bg-cyber-accent text-cyber-bg font-bold rounded-md transition-transform transform hover:scale-105 animate-glow"
                >
                  NEXT MISSION &rarr;
                </button>
              ) : (
                 <p className="mt-4 text-yellow-300 font-semibold">ALL MISSIONS COMPLETED. COMMAND AWAITS YOUR REPORT.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChallengeView;