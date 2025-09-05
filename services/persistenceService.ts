import { firebaseIntegration } from './firebaseService';
import { logger } from '../utils/Logger';
import { ChallengeProgress, ChallengeStatus } from '../types';

export interface UserPreferences {
  isMuted: boolean;
  selectedImageService: string;
  theme: string;
  notifications: boolean;
}

export interface ProgressData {
  challengeProgress: Record<number, ChallengeProgress>;
  totalStreak: number;
  lastActivity: number;
  completedChallenges: number[];
}

export class PersistenceService {
  private static instance: PersistenceService;
  private readonly PROGRESS_KEY = 'prompt-challenge-progress';
  private readonly MUTE_KEY = 'prompt-challenge-muted';
  private readonly PREFERENCES_KEY = 'user-preferences';
  
  // Local cache for performance
  private localCache = new Map<string, any>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps = new Map<string, number>();

  private constructor() {}

  static getInstance(): PersistenceService {
    if (!PersistenceService.instance) {
      PersistenceService.instance = new PersistenceService();
    }
    return PersistenceService.instance;
  }

  // --- Progress Management ---
  async saveProgress(userId: string, progressData: ProgressData): Promise<void> {
    try {
      if (firebaseIntegration.isInitialized()) {
        await firebaseIntegration.saveUserProgress(userId, {
          ...progressData,
          lastUpdated: Date.now()
        });
        
        // Update local cache
        this.updateLocalCache(`progress_${userId}`, progressData);
        
        logger.info('PROGRESS_SAVED_FIREBASE', {
          userId,
          metadata: { 
            challengeCount: Object.keys(progressData.challengeProgress).length,
            totalStreak: progressData.totalStreak
          }
        });
      } else {
        // Fallback to localStorage
        this.saveToLocalStorage(this.PROGRESS_KEY, progressData);
        logger.warn('PROGRESS_SAVED_LOCALSTORAGE_FALLBACK', { userId });
      }
    } catch (error: any) {
      logger.error('PROGRESS_SAVE_FAILED', {
        userId,
        metadata: { error: error.message }
      });
      
      // Fallback to localStorage on Firebase failure
      this.saveToLocalStorage(`${this.PROGRESS_KEY}_${userId}`, progressData);
      throw error;
    }
  }

  async loadProgress(userId: string): Promise<ProgressData | null> {
    try {
      // Check local cache first
      const cacheKey = `progress_${userId}`;
      const cachedData = this.getFromLocalCache(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      if (firebaseIntegration.isInitialized()) {
        const firebaseData = await firebaseIntegration.getUserProgress(userId);
        
        if (firebaseData) {
          const progressData: ProgressData = {
            challengeProgress: firebaseData.challengeProgress || {},
            totalStreak: firebaseData.totalStreak || 0,
            lastActivity: firebaseData.lastActivity || Date.now(),
            completedChallenges: firebaseData.completedChallenges || []
          };
          
          // Update local cache
          this.updateLocalCache(cacheKey, progressData);
          
          logger.info('PROGRESS_LOADED_FIREBASE', { userId });
          return progressData;
        }
      }

      // Fallback to localStorage
      const localData = this.getFromLocalStorage(`${this.PROGRESS_KEY}_${userId}`) ||
                       this.getFromLocalStorage(this.PROGRESS_KEY);
      
      if (localData) {
        logger.info('PROGRESS_LOADED_LOCALSTORAGE', { userId });
        return localData;
      }

      // Return default progress if nothing found
      return this.createDefaultProgress();

    } catch (error: any) {
      logger.error('PROGRESS_LOAD_FAILED', {
        userId,
        metadata: { error: error.message }
      });
      
      // Final fallback to localStorage
      const fallbackData = this.getFromLocalStorage(`${this.PROGRESS_KEY}_${userId}`);
      return fallbackData || this.createDefaultProgress();
    }
  }

  // --- User Preferences ---
  async savePreferences(userId: string, preferences: UserPreferences): Promise<void> {
    try {
      if (firebaseIntegration.isInitialized()) {
        await firebaseIntegration.saveUserProgress(userId, {
          preferences: preferences,
          preferencesUpdated: Date.now()
        });
        
        this.updateLocalCache(`preferences_${userId}`, preferences);
        logger.info('PREFERENCES_SAVED_FIREBASE', { userId });
      } else {
        this.saveToLocalStorage(`${this.PREFERENCES_KEY}_${userId}`, preferences);
        logger.warn('PREFERENCES_SAVED_LOCALSTORAGE_FALLBACK', { userId });
      }
    } catch (error: any) {
      logger.error('PREFERENCES_SAVE_FAILED', {
        userId,
        metadata: { error: error.message }
      });
      
      this.saveToLocalStorage(`${this.PREFERENCES_KEY}_${userId}`, preferences);
      throw error;
    }
  }

  async loadPreferences(userId: string): Promise<UserPreferences> {
    try {
      // Check local cache
      const cacheKey = `preferences_${userId}`;
      const cachedData = this.getFromLocalCache(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      if (firebaseIntegration.isInitialized()) {
        const firebaseData = await firebaseIntegration.getUserProgress(userId);
        
        if (firebaseData?.preferences) {
          this.updateLocalCache(cacheKey, firebaseData.preferences);
          logger.info('PREFERENCES_LOADED_FIREBASE', { userId });
          return firebaseData.preferences;
        }
      }

      // Fallback to localStorage
      const localData = this.getFromLocalStorage(`${this.PREFERENCES_KEY}_${userId}`) ||
                       this.getFromLocalStorage(this.MUTE_KEY);
      
      if (localData) {
        logger.info('PREFERENCES_LOADED_LOCALSTORAGE', { userId });
        
        // Convert old mute-only format to full preferences
        if (typeof localData === 'boolean') {
          return this.createDefaultPreferences(localData);
        }
        return localData;
      }

      return this.createDefaultPreferences();

    } catch (error: any) {
      logger.error('PREFERENCES_LOAD_FAILED', {
        userId,
        metadata: { error: error.message }
      });
      
      const fallbackData = this.getFromLocalStorage(`${this.PREFERENCES_KEY}_${userId}`);
      return fallbackData || this.createDefaultPreferences();
    }
  }

  // --- Mute State (Legacy Support) ---
  async saveMuteState(userId: string, isMuted: boolean): Promise<void> {
    const preferences = await this.loadPreferences(userId);
    preferences.isMuted = isMuted;
    await this.savePreferences(userId, preferences);
  }

  async loadMuteState(userId: string): Promise<boolean> {
    const preferences = await this.loadPreferences(userId);
    return preferences.isMuted;
  }

  // --- Data Migration ---
  async migrateLocalStorageToFirebase(userId: string): Promise<void> {
    if (!firebaseIntegration.isInitialized()) {
      logger.warn('MIGRATION_SKIPPED_NO_FIREBASE', { userId });
      return;
    }

    try {
      // Migrate progress data
      const localProgress = this.getFromLocalStorage(this.PROGRESS_KEY);
      if (localProgress) {
        await this.saveProgress(userId, localProgress);
        logger.info('PROGRESS_MIGRATED_TO_FIREBASE', { userId });
      }

      // Migrate mute state
      const localMuted = this.getFromLocalStorage(this.MUTE_KEY);
      if (localMuted !== null) {
        await this.saveMuteState(userId, localMuted);
        logger.info('MUTE_STATE_MIGRATED_TO_FIREBASE', { userId });
      }

      // Clear old localStorage after successful migration
      this.clearLocalStorage(this.PROGRESS_KEY);
      this.clearLocalStorage(this.MUTE_KEY);
      
      logger.info('MIGRATION_COMPLETED', { userId });
    } catch (error: any) {
      logger.error('MIGRATION_FAILED', {
        userId,
        metadata: { error: error.message }
      });
      throw error;
    }
  }

  // --- Utility Methods ---
  private createDefaultProgress(): ProgressData {
    const challengeProgress: Record<number, ChallengeProgress> = {};
    
    // Initialize with first challenge unlocked
    for (let i = 1; i <= 6; i++) {
      challengeProgress[i] = {
        status: i === 1 ? ChallengeStatus.UNLOCKED : ChallengeStatus.LOCKED,
        streak: 0,
        previousSimilarityScore: 0
      };
    }

    return {
      challengeProgress,
      totalStreak: 0,
      lastActivity: Date.now(),
      completedChallenges: []
    };
  }

  private createDefaultPreferences(isMuted?: boolean): UserPreferences {
    return {
      isMuted: isMuted ?? false,
      selectedImageService: 'pollinations-flux',
      theme: 'cyberpunk',
      notifications: true
    };
  }

  // --- Local Cache Management ---
  private updateLocalCache(key: string, data: any): void {
    this.localCache.set(key, data);
    this.cacheTimestamps.set(key, Date.now());
  }

  private getFromLocalCache(key: string): any {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp || (Date.now() - timestamp) > this.cacheTimeout) {
      this.localCache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }
    return this.localCache.get(key);
  }

  private clearLocalCache(userId: string): void {
    const keysToDelete = [];
    for (const key of this.localCache.keys()) {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.localCache.delete(key);
      this.cacheTimestamps.delete(key);
    });
  }

  // --- LocalStorage Helpers ---
  private saveToLocalStorage(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error: any) {
      logger.error('LOCALSTORAGE_SAVE_FAILED', {
        metadata: { key, error: error.message }
      });
    }
  }

  private getFromLocalStorage(key: string): any {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error: any) {
      logger.error('LOCALSTORAGE_LOAD_FAILED', {
        metadata: { key, error: error.message }
      });
      return null;
    }
  }

  private clearLocalStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error: any) {
      logger.error('LOCALSTORAGE_CLEAR_FAILED', {
        metadata: { key, error: error.message }
      });
    }
  }

  // --- Health Check ---
  async healthCheck(): Promise<boolean> {
    try {
      if (firebaseIntegration.isInitialized()) {
        return await firebaseIntegration.healthCheck();
      }
      return true; // LocalStorage is always available
    } catch (error) {
      return false;
    }
  }

  // --- Statistics ---
  getStats() {
    return {
      cacheSize: this.localCache.size,
      firebaseInitialized: firebaseIntegration.isInitialized(),
      localStorageAvailable: typeof Storage !== 'undefined'
    };
  }
}

export const persistenceService = PersistenceService.getInstance();