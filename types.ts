
export enum ChallengeStatus {
  LOCKED = 'LOCKED',
  UNLOCKED = 'UNLOCKED',
  COMPLETED = 'COMPLETED',
}

export interface Challenge {
  id: number;
  name: string;
  imageUrl: string;
  description: string;
}

export interface AnalysisResult {
  similarityScore: number;
  feedback: string[];
}

export interface ChallengeProgress {
  status: ChallengeStatus;
  streak: number;
  previousSimilarityScore: number;
}

export type ImageService = 'pollinations-flux' | 'pollinations-kontext' | 'pollinations-krea' | 'gemini-imagen-3' | 'gemini-imagen-4-fast' | 'gemini-imagen-4-ultra';

export type User = {
  email: string;
};