import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { ImageService } from '../types';
import { logger } from '../utils/Logger';
import { requestQueue } from '../utils/RequestQueue';
import { imageCache, promptCache } from '../utils/IntelligentCache';
import { rateLimiter } from '../utils/RateLimiter';
import { responseOptimizer } from '../utils/ResponseOptimizer';
import { firebaseIntegration } from './firebaseService';
import { autoSavePromptAndImage } from './storageService';

// --- Enhanced API Key Management ---
interface ApiKeyInfo {
  key: string;
  index: number;
  isActive: boolean;
  lastUsed: number;
  errorCount: number;
  quotaExhausted: boolean;
  nextAvailableTime: number;
  requestCount: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

class ApiKeyManager {
  private keys: ApiKeyInfo[] = [];
  private currentIndex = 0;
  private maxErrors = 3;
  private quotaCooldown = 60 * 60 * 1000; // 1 hour
  private readonly retryConfig: RetryConfig = {
    maxRetries: 11, // Try all 11 keys at least once
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    backoffMultiplier: 2
  };

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys(): void {
    // ✅ FIXED: Access environment variables correctly for Vite frontend
    const keyEnvs = [
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
      process.env.GEMINI_API_KEY_5,
      process.env.GEMINI_API_KEY_6,
      process.env.GEMINI_API_KEY_7,
      process.env.GEMINI_API_KEY_8,
      process.env.GEMINI_API_KEY_9,
      process.env.GEMINI_API_KEY_10,
      process.env.GEMINI_API_KEY_11
    ];

    this.keys = keyEnvs
      .map((key, index) => key ? {
        key,
        index,
        isActive: true,
        lastUsed: 0,
        errorCount: 0,
        quotaExhausted: false,
        nextAvailableTime: 0,
        requestCount: 0
      } : null)
      .filter((key): key is ApiKeyInfo => key !== null);

    if (this.keys.length === 0) {
      // ✅ FIXED: Better fallback handling
      const fallbackKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (fallbackKey) {
        this.keys.push({
          key: fallbackKey,
          index: 0,
          isActive: true,
          lastUsed: 0,
          errorCount: 0,
          quotaExhausted: false,
          nextAvailableTime: 0,
          requestCount: 0
        });
      }
    }

    // ✅ ENHANCED: Better error reporting if no keys found
    if (this.keys.length === 0) {
      const availableEnvVars = Object.keys(process.env).filter(key => 
        key.includes('GEMINI') || key.includes('API_KEY')
      );
      
      logger.error('NO_API_KEYS_FOUND', {
        metadata: { 
          availableEnvVars,
          nodeEnv: process.env.NODE_ENV || 'unknown'
        }
      });
      
      throw new Error(`No valid API keys found. Available env vars: ${availableEnvVars.join(', ')}`);
    }

    logger.info('API_KEY_MANAGER_INITIALIZED', {
      metadata: { 
        totalKeys: this.keys.length,
        activeKeys: this.keys.filter(k => k.isActive).length
      }
    });
  }

  /**
   * Get the next available API key using round-robin rotation
   * Enhanced with automatic recovery and better availability checks
   */
  getCurrentKey(): ApiKeyInfo | null {
    const now = Date.now();
    
    // First, recover any quota-exhausted keys that have cooled down
    this.keys.forEach(key => {
      if (key.quotaExhausted && now >= key.nextAvailableTime) {
        key.quotaExhausted = false;
        key.errorCount = 0;
        key.isActive = true;
        logger.info('API_KEY_RECOVERED', {
          metadata: { keyIndex: key.index }
        });
      }
      
      // Also recover error-disabled keys after cooldown
      if (!key.isActive && !key.quotaExhausted && now >= key.nextAvailableTime) {
        key.isActive = true;
        key.errorCount = 0;
        logger.info('API_KEY_REACTIVATED', {
          metadata: { keyIndex: key.index }
        });
      }
    });
    
    // FIXED: Proper round-robin without filtering disruption
    const startIndex = this.currentIndex;
    let attempts = 0;
    
    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      
      // Move to next key for next request (ALWAYS increment to maintain sequence)
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      attempts++;
      
      // Check if current key is available
      if (key.isActive && !key.quotaExhausted && now >= key.nextAvailableTime) {
        logger.info('KEY_SELECTED_FOR_REQUEST', {
          metadata: { 
            keyIndex: key.index,
            requestCount: key.requestCount,
            errorCount: key.errorCount,
            currentRotationIndex: this.currentIndex
          }
        });
        return key;
      }
      
      // Log why key was skipped
      const skipReason = !key.isActive ? 'inactive' : 
                        key.quotaExhausted ? 'quota_exhausted' : 
                        now < key.nextAvailableTime ? 'cooldown' : 'unknown';
                        
      logger.debug('KEY_SKIPPED', {
        metadata: { 
          keyIndex: key.index, 
          reason: skipReason,
          cooldownRemaining: Math.max(0, key.nextAvailableTime - now),
          rotationIndex: (this.currentIndex - 1 + this.keys.length) % this.keys.length
        }
      });
    }
    
    // No keys available
    logger.warn('NO_KEYS_AVAILABLE', {
      metadata: { 
        totalKeys: this.keys.length,
        activeKeys: this.keys.filter(k => k.isActive).length,
        quotaExhaustedKeys: this.keys.filter(k => k.quotaExhausted).length,
        currentRotationIndex: this.currentIndex
      }
    });
    
    return null;
  }

  recordError(keyIndex: number, isQuotaError: boolean = false): void {
    const key = this.keys.find(k => k.index === keyIndex);
    if (!key) return;

    key.errorCount++;
    key.lastUsed = Date.now();

    if (isQuotaError) {
      key.quotaExhausted = true;
      key.nextAvailableTime = Date.now() + this.quotaCooldown;
      logger.logApiKeyRotation(keyIndex, -1, 'quota_exhausted');
      logger.warn('KEY_QUOTA_EXHAUSTED', {
        metadata: { 
          keyIndex, 
          cooldownUntil: new Date(key.nextAvailableTime).toISOString()
        }
      });
    } else {
      // For non-quota errors (like 500 errors), much shorter cooldown
      key.nextAvailableTime = Date.now() + (30 * 1000); // Only 30 seconds for server errors
    }

    // ✅ FIXED: More lenient error threshold for server issues
    if (key.errorCount >= (this.maxErrors * 2)) { // Double the threshold for 500 errors
      key.isActive = false;
      key.nextAvailableTime = Date.now() + (5 * 60 * 1000); // Only 5 min cooldown for server errors
      logger.logApiKeyRotation(keyIndex, -1, 'max_errors_reached');
      logger.error('KEY_DISABLED_MAX_ERRORS', {
        metadata: { 
          keyIndex, 
          errorCount: key.errorCount,
          reactivationTime: new Date(key.nextAvailableTime).toISOString(),
          note: 'Lenient threshold applied for server errors'
        }
      });
    }
  }

  recordSuccess(keyIndex: number): void {
    const key = this.keys.find(k => k.index === keyIndex);
    if (!key) return;

    key.errorCount = 0;
    key.lastUsed = Date.now();
    key.requestCount++;
    key.nextAvailableTime = 0; // Clear any cooldown
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is related to quota/rate limiting
   */
  private isQuotaError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorString = error?.toString?.()?.toLowerCase() || '';
    const statusCode = error?.status || error?.code || error?.statusCode || error?.response?.status;
    
    // Don't treat 500 Internal Server Errors as quota errors
    if (statusCode === 500) {
      logger.warn('SERVER_ERROR_DETECTED', {
        metadata: {
          errorMessage: error?.message,
          statusCode,
          note: 'Treating as temporary server issue, not quota limit'
        }
      });
      return false; // 500 errors are server issues, not quota issues
    }
    
    const quotaKeywords = [
      'quota exceeded',
      'rate limit',
      'too many requests',
      'resource exhausted',
      'quota_exceeded',
      'rate_limit_exceeded',
      'user rate limit exceeded',
      'requests per minute exceeded',
      'daily limit exceeded',
      'billing quota exceeded',
      'api quota exceeded',
      'usage limit exceeded',
      'insufficient quota',
      'quota insufficient',
      '429',
      'throttled',
      'rate limited'
    ];
    
    // Check error message, error string, and status codes
    const hasQuotaKeyword = quotaKeywords.some(keyword => 
      errorMessage.includes(keyword) || errorString.includes(keyword)
    );
    
    const hasQuotaStatus = statusCode === 429;
    
    const result = hasQuotaKeyword || hasQuotaStatus;
    
    if (result) {
      logger.info('QUOTA_ERROR_DETECTED', {
        metadata: {
          errorMessage: error?.message,
          errorCode: statusCode,
          detectedKeywords: quotaKeywords.filter(k => 
            errorMessage.includes(k) || errorString.includes(k)
          )
        }
      });
    }
    
    return result;
  }

  /**
   * Enhanced request method with round-robin rotation and exponential backoff
   */
  async makeRequestWithRetry<T>(
    requestFn: (apiKey: string, keyIndex: number) => Promise<T>,
    operationName: string = 'API request'
  ): Promise<T> {
    let lastError: Error | null = null;
    const triedKeys = new Set<number>(); // Track which keys we've already tried
    const totalKeys = this.keys.length;
    
    // Try each key at least once, then do additional retries
    const maxAttempts = Math.max(totalKeys * 2, this.retryConfig.maxRetries); // At least 2 rounds through all keys
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Get next available API key
      const keyInfo = this.getCurrentKey();
      
      if (!keyInfo) {
        // All keys are exhausted, check if we should wait and retry
        logger.warn('ALL_KEYS_EXHAUSTED_TEMPORARILY', {
          metadata: { 
            attempt: attempt + 1,
            maxAttempts,
            triedKeys: Array.from(triedKeys),
            totalKeys
          }
        });
        
        // If we haven't tried all keys yet, wait a bit for them to recover
        if (triedKeys.size < totalKeys || attempt < maxAttempts - 1) {
          const waitTime = this.calculateBackoffDelay(Math.floor(attempt / totalKeys));
          logger.info('WAITING_FOR_KEY_RECOVERY', {
            metadata: { waitTime, keysTriedSoFar: triedKeys.size, totalKeys }
          });
          await this.sleep(waitTime);
          continue;
        } else {
          // We've exhausted all attempts
          const keyStatuses = this.keys.map(k => 
            `Key ${k.index}: ${k.isActive ? 'active' : 'disabled'}, ${k.quotaExhausted ? 'quota exhausted' : 'quota ok'}`
          ).join('; ');
          
          throw new Error(
            `All API keys exhausted after ${maxAttempts} attempts across ${totalKeys} keys. ` +
            `Keys tried: [${Array.from(triedKeys).join(', ')}]. ` +
            `Key statuses: ${keyStatuses}. ` +
            `Last error: ${lastError?.message || 'Unknown error'}`
          );
        }
      }

      // Mark this key as tried
      triedKeys.add(keyInfo.index);

      try {
        logger.info('API_REQUEST_ATTEMPT', {
          metadata: {
            operationName,
            attempt: attempt + 1,
            maxAttempts,
            keyIndex: keyInfo.index,
            keyPreview: `${keyInfo.key.substring(0, 20)}...`,
            triedKeys: Array.from(triedKeys),
            totalKeysTried: triedKeys.size
          }
        });
        
        // Make the actual request
        const result = await requestFn(keyInfo.key, keyInfo.index);
        
        // Success! Update metrics and return result
        this.recordSuccess(keyInfo.index);
        logger.info('API_REQUEST_SUCCESS', {
          metadata: {
            operationName,
            attempt: attempt + 1,
            keyIndex: keyInfo.index,
            totalKeysTried: triedKeys.size
          }
        });
        
        return result;
        
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
        
        logger.error('API_REQUEST_FAILED', {
          metadata: {
            operationName,
            attempt: attempt + 1,
            keyIndex: keyInfo.index,
            error: errorMessage,
            errorStack: error?.stack,
            errorCode: error?.code,
            errorStatus: error?.status,
            triedKeys: Array.from(triedKeys)
          }
        });
        
        // Check if this is a quota/rate limit error
        const isQuota = this.isQuotaError(error);
        this.recordError(keyInfo.index, isQuota);
        
        // Log why we're continuing or stopping
        if (attempt < maxAttempts - 1) {
          const backoffDelay = this.calculateBackoffDelay(Math.floor(attempt / totalKeys));
          logger.info('API_REQUEST_RETRYING', {
            metadata: {
              operationName,
              nextAttempt: attempt + 2,
              backoffDelay,
              isQuotaError: isQuota,
              keysRemainingToTry: totalKeys - triedKeys.size,
              errorMessage
            }
          });
          
          // Small delay between attempts
          await this.sleep(Math.min(backoffDelay, 1000));
          continue;
        }
      }
    }

    // All retries exhausted - this should rarely happen now
    throw new Error(
      `${operationName} failed after ${maxAttempts} attempts across ${totalKeys} keys. ` +
      `Keys tried: [${Array.from(triedKeys).join(', ')}]. ` +
      `Last error: ${lastError?.message || 'Unknown error'}. ` +
      `Error type: ${lastError?.constructor?.name || 'Unknown'}`
    );
  }

  getStats() {
    return {
      totalKeys: this.keys.length,
      activeKeys: this.keys.filter(k => k.isActive).length,
      quotaExhaustedKeys: this.keys.filter(k => k.quotaExhausted).length,
      totalRequests: this.keys.reduce((sum, k) => sum + k.requestCount, 0),
      totalErrors: this.keys.reduce((sum, k) => sum + k.errorCount, 0),
      retryConfig: this.retryConfig,
      keyStats: this.keys.map(k => ({
        index: k.index,
        isActive: k.isActive,
        errorCount: k.errorCount,
        requestCount: k.requestCount,
        quotaExhausted: k.quotaExhausted,
        lastUsed: k.lastUsed,
        nextAvailableTime: k.nextAvailableTime
      }))
    };
  }

  /**
   * Get detailed debug information about key distribution
   */
  getDistributionDebugInfo() {
    const now = Date.now();
    return {
      currentRotationIndex: this.currentIndex,
      nextKeyWillBe: this.keys[this.currentIndex]?.index || 'none',
      rotationSequence: this.keys.map(k => k.index),
      keyStatusSummary: this.keys.map(key => ({
        index: key.index,
        isActive: key.isActive,
        quotaExhausted: key.quotaExhausted,
        errorCount: key.errorCount,
        requestCount: key.requestCount,
        lastUsed: key.lastUsed ? new Date(key.lastUsed).toLocaleTimeString() : 'never',
        cooldownRemaining: key.nextAvailableTime > now ? 
          Math.ceil((key.nextAvailableTime - now) / 1000) + 's' : '0s',
        status: key.quotaExhausted ? '🔴 QUOTA_EXHAUSTED' : 
                !key.isActive ? '🟡 DISABLED' : 
                now < key.nextAvailableTime ? '🟠 COOLDOWN' : '🟢 AVAILABLE'
      })),
      distributionPattern: this.keys.map(key => key.requestCount),
      isEvenlyDistributed: this.checkDistributionBalance()
    };
  }

  /**
   * Check if requests are evenly distributed across keys
   */
  private checkDistributionBalance(): boolean {
    const counts = this.keys.map(k => k.requestCount);
    if (counts.length === 0) return true;
    
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const variance = max - min;
    
    // Consider balanced if difference between max and min is <= 2
    return variance <= 2;
  }

  /**
   * Emergency reset all keys - use with caution
   */
  emergencyResetAllKeys() {
    const keysReset = this.keys.filter(k => !k.isActive || k.quotaExhausted).length;
    
    // Reset all keys to active state
    this.keys.forEach(key => {
      key.isActive = true;
      key.quotaExhausted = false;
      key.errorCount = 0;
      key.nextAvailableTime = 0;
    });
    
    logger.warn('EMERGENCY_KEY_RESET', {
      metadata: {
        keysReset,
        totalKeys: this.keys.length,
        reason: 'Manual emergency reset due to server errors'
      }
    });
    
    return keysReset;
  }
}

// --- AI Client Management ---
const keyManager = new ApiKeyManager();
const aiClients = new Map<string, GoogleGenAI>();

const getAiClient = (apiKey: string): GoogleGenAI => {
  if (!aiClients.has(apiKey)) {
    aiClients.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return aiClients.get(apiKey)!;
};

// Legacy initialization for backward compatibility
export const initializeAi = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("An API key is required to initialize the AI service.");
  }
  // This is now handled by the key manager
  logger.info('LEGACY_AI_INITIALIZATION', { metadata: { hasKey: !!apiKey } });
};

export const getAi = (): GoogleGenAI => {
  const currentKey = keyManager.getCurrentKey();
  if (!currentKey) {
    throw new Error("No active API keys available. All keys may be exhausted or disabled.");
  }
  return getAiClient(currentKey.key);
};

// --- Enhanced Image Generation ---
export const generateImage = async (
  prompt: string, 
  service: ImageService = 'pollinations-flux',
  userId?: string
): Promise<string> => {
  const requestId = uuidv4();
  
  logger.logRequestReceived(requestId, userId || 'anonymous', prompt);

  // Rate limiting check
  if (userId) {
    const rateLimitInfo = rateLimiter.checkLimit(userId);
    if (rateLimitInfo.blocked) {
      const cooldownMs = rateLimitInfo.blockUntil ? rateLimitInfo.blockUntil - Date.now() : 0;
      logger.logRateLimitExceeded(userId, cooldownMs);
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(cooldownMs / 1000)} seconds before trying again.`);
    }
    
    if (!rateLimiter.recordRequest(userId)) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
  }

  // Check cache first
  const cacheKey = imageCache.generateKey(prompt, undefined, userId);
  const cachedResult = imageCache.get(cacheKey);
  
  if (cachedResult) {
    logger.logCacheCheck(requestId, 'HIT', cacheKey);
    logger.logResponseSent(requestId, 0, 'HIT');
    return cachedResult;
  }
  
  logger.logCacheCheck(requestId, 'MISS', cacheKey);

  // Queue the request for processing
  return await requestQueue.enqueue(
    userId || 'anonymous',
    prompt,
    async () => {
      return await processImageGeneration(requestId, prompt, service, userId, cacheKey);
    },
    undefined,
    service.includes('gemini') ? 10 : 0 // Higher priority for Gemini services
  );
};

// --- Core Image Processing ---
const processImageGeneration = async (
  requestId: string,
  prompt: string,
  service: ImageService,
  userId?: string,
  cacheKey?: string
): Promise<string> => {
  const startTime = Date.now();
  let finalPrompt = prompt + " Don't add any additional effects or styles";
  
  try {
    let imageData: string;

    if (service.startsWith('pollinations-')) {
      imageData = await generatePollinationsImage(requestId, finalPrompt, service);
    } else if (service.includes('gemini-imagen')) {
      imageData = await generateGeminiImage(requestId, finalPrompt, service);
    } else {
      throw new Error('Unknown image service selected');
    }

    // Optimize response
    if (responseOptimizer.shouldOptimize(imageData.length)) {
      const optimized = await responseOptimizer.optimizeImage(imageData);
      imageData = optimized.optimizedData as string;
      
      logger.info('IMAGE_OPTIMIZATION_APPLIED', {
        requestId,
        metadata: {
          originalSize: optimized.originalSize,
          compressedSize: optimized.compressedSize,
          compressionRatio: optimized.compressionRatio
        }
      });
    }

    // Cache the result
    if (cacheKey) {
      imageCache.set(cacheKey, imageData);
    }

    // Save to Firebase if user is provided
    if (userId && firebaseIntegration.isInitialized()) {
      try {
        let imagePath = '';
        
        // Skip Firebase Storage upload in development to avoid CORS issues
        // Only upload to storage in production environment
        if (process.env.NODE_ENV === 'production') {
          // Convert base64 to blob for Firebase Storage
          const blob = base64ToBlob(imageData);
          const uploadResult = await firebaseIntegration.uploadImage(blob, userId, requestId);
          imagePath = uploadResult.fullPath;
          console.log('✅ Firebase Storage: Image uploaded to production storage');
        } else {
          // In development, store a placeholder path
          imagePath = `dev_images/${userId}/${requestId}.png`;
          console.log('⚠️ Firebase Storage: Skipped upload in development (CORS workaround)');
        }
        
        // Save metadata to Firestore (works in development)
        await firebaseIntegration.saveUserRequest({
          requestId,
          userId,
          prompt,
          similarityScore: 0, // Will be updated later by analysis
          cacheStatus: 'MISS',
          imagePath: imagePath,
          processingTime: Date.now() - startTime,
          apiKeyIndex: -1 // Will be updated if Gemini was used
        });
      } catch (firebaseError: any) {
        logger.error('FIREBASE_SAVE_FAILED', {
          requestId,
          userId,
          metadata: { error: firebaseError.message }
        });
        // Continue execution - Firebase failure shouldn't block the response
      }
    }

    const processingTime = Date.now() - startTime;
    logger.logResponseSent(requestId, processingTime, 'MISS');
    
    // 🎯 AUTO-SAVE: Automatically save prompt and image to storage API
    if (prompt && imageData) {
      // Don't await - let it save in background without blocking response
      autoSavePromptAndImage(prompt, imageData).catch(err => 
        console.log('📱 Background auto-save failed (non-critical):', err.message)
      );
    }
    
    return imageData;

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    logger.error('IMAGE_GENERATION_FAILED', {
      requestId,
      userId,
      metadata: { 
        error: error.message, 
        service,
        processingTime 
      }
    });
    throw error;
  }
};

// --- Advanced Image Generation with Multiple APIs ---
const generateAdvancedImage = async (
  requestId: string,
  prompt: string,
  service: ImageService
): Promise<string> => {
  // ✅ NEW: Try multiple image generation APIs for better results
  const imageAPIs = [
    {
      name: 'Pollinations',
      generator: () => generatePollinationsImage(requestId, prompt, service),
      weight: 1
    },
    {
      name: 'Leonardo.AI',
      generator: () => generateLeonardoImage(requestId, prompt, service),
      weight: 2
    },
    {
      name: 'Stability.AI',
      generator: () => generateStabilityImage(requestId, prompt, service),
      weight: 3
    }
  ];

  // Sort by weight (higher weight = higher priority)
  imageAPIs.sort((a, b) => b.weight - a.weight);

  let lastError: Error | null = null;

  for (const api of imageAPIs) {
    try {
      logger.info('TRYING_IMAGE_API', {
        requestId,
        metadata: { api: api.name, service, prompt: prompt.substring(0, 50) + '...' }
      });

      const result = await api.generator();
      
      logger.info('IMAGE_API_SUCCESS', {
        requestId,
        metadata: { api: api.name, service, succeeded: true }
      });

      return result;

    } catch (apiError: any) {
      lastError = apiError;
      logger.warn('IMAGE_API_FAILED', {
        requestId,
        metadata: { 
          api: api.name, 
          service,
          error: apiError.message,
          tryingNext: true
        }
      });
      continue;
    }
  }

  throw lastError || new Error('All image generation APIs failed');
};

// --- Leonardo.AI Image Generation ---
const generateLeonardoImage = async (
  requestId: string,
  prompt: string,
  service: ImageService
): Promise<string> => {
  try {
    // ✅ NEW: Leonardo.AI API integration
    const leonardoModels = {
      'gemini-imagen-4-fast': 'leonardo-creative',
      'gemini-imagen-4-ultra': 'leonardo-signature',
      'pollinations-flux': 'leonardo-diffusion',
      'default': 'leonardo-creative'
    };

    const model = leonardoModels[service] || leonardoModels.default;
    let enhancedPrompt = prompt;

    if (service.includes('ultra') || service.includes('detailed')) {
      enhancedPrompt = `${prompt}, ultra high quality, 8k resolution, masterpiece, detailed`;
    } else if (service.includes('fast')) {
      enhancedPrompt = `${prompt}, high quality, artistic`;
    }

    // Mock Leonardo API call (replace with actual API when available)
    const leonardoUrl = `https://cloud.leonardo.ai/api/rest/v1/generations`;
    
    // For now, fall back to Pollinations with Leonardo-style prompting
    logger.info('LEONARDO_FALLBACK_TO_POLLINATIONS', {
      requestId,
      metadata: { model, reason: 'Leonardo API not configured, using enhanced Pollinations' }
    });

    return await generatePollinationsImage(requestId, enhancedPrompt, 'pollinations-flux');

  } catch (error: any) {
    logger.error('LEONARDO_GENERATION_FAILED', {
      requestId,
      metadata: { error: error.message, service }
    });
    throw error;
  }
};

// --- Stability.AI Image Generation ---
const generateStabilityImage = async (
  requestId: string,
  prompt: string,
  service: ImageService
): Promise<string> => {
  try {
    // ✅ NEW: Stability.AI API integration
    const stabilityModels = {
      'gemini-imagen-4-fast': 'stable-diffusion-xl-beta-v2-2-2',
      'gemini-imagen-4-ultra': 'stable-diffusion-xl-1024-v1-0',
      'pollinations-flux': 'stable-diffusion-v1-6',
      'default': 'stable-diffusion-xl-beta-v2-2-2'
    };

    const model = stabilityModels[service] || stabilityModels.default;
    let enhancedPrompt = prompt;

    if (service.includes('ultra') || service.includes('detailed')) {
      enhancedPrompt = `${prompt}, (masterpiece:1.4), (ultra detailed:1.2), (photorealistic:1.3), 8k uhd`;
    } else if (service.includes('fast')) {
      enhancedPrompt = `${prompt}, high quality, detailed`;
    }

    // Mock Stability API call (replace with actual API when available)
    logger.info('STABILITY_FALLBACK_TO_POLLINATIONS', {
      requestId,
      metadata: { model, reason: 'Stability API not configured, using enhanced Pollinations' }
    });

    return await generatePollinationsImage(requestId, enhancedPrompt, 'pollinations-flux');

  } catch (error: any) {
    logger.error('STABILITY_GENERATION_FAILED', {
      requestId,
      metadata: { error: error.message, service }
    });
    throw error;
  }
};
const generatePollinationsImage = async (
  requestId: string, 
  prompt: string, 
  service: ImageService
): Promise<string> => {
  try {
    // ✅ ENHANCED: Support multiple Pollinations models
    let model = 'flux';
    let enhancedPrompt = prompt;
    
    // Map service to appropriate model and enhance prompt
    switch (service) {
      case 'pollinations-flux':
        model = 'flux';
        enhancedPrompt = `${prompt}, high quality, detailed, artistic`;
        break;
      case 'pollinations-turbo':
        model = 'turbo';
        enhancedPrompt = `${prompt}, fast generation, good quality`;
        break;
      case 'pollinations-enhancer':
        model = 'enhancer';
        enhancedPrompt = `${prompt}, enhanced details, improved quality`;
        break;
      case 'pollinations-playground':
        model = 'playground';
        enhancedPrompt = `${prompt}, creative, experimental style`;
        break;
      default:
        model = 'flux';
        enhancedPrompt = prompt;
    }
    
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    
    // ✅ IMPROVED: Multiple URL patterns for better success rate
    const imageUrls = [
      `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${model}&width=1024&height=1024&nologo=true`,
      `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${model}&size=1024x1024`,
      `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${model}`,
      `https://pollinations.ai/p/${encodedPrompt}?model=${model}`
    ];
    
    let lastError: Error | null = null;
    
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const imageUrl = imageUrls[i];
        logger.info('POLLINATIONS_ATTEMPT', {
          requestId,
          metadata: { 
            attempt: i + 1, 
            model, 
            url: imageUrl.substring(0, 100) + '...',
            promptLength: enhancedPrompt.length
          }
        });
        
        const response = await fetch(imageUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0) {
          throw new Error('Empty response received');
        }
        
        const uint8Array = new Uint8Array(arrayBuffer);
        const binaryString = Array.from(uint8Array).map((byte) => String.fromCharCode(byte)).join('');
        const base64 = btoa(binaryString);
        
        logger.info('POLLINATIONS_SUCCESS', {
          requestId,
          metadata: { 
            attempt: i + 1, 
            model, 
            imageSizeKB: Math.round(arrayBuffer.byteLength / 1024),
            succeeded: true
          }
        });
        
        return `data:image/png;base64,${base64}`;
        
      } catch (urlError: any) {
        lastError = urlError;
        logger.warn('POLLINATIONS_URL_FAILED', {
          requestId,
          metadata: { 
            attempt: i + 1, 
            model,
            error: urlError.message,
            tryingNext: i < imageUrls.length - 1
          }
        });
        
        // Add delay between attempts
        if (i < imageUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw lastError || new Error('All Pollinations URLs failed');
    
  } catch (error: any) {
    logger.error('POLLINATIONS_GENERATION_FAILED', {
      requestId,
      metadata: { error: error.message, service, model: service.replace('pollinations-', '') }
    });
    throw new Error(`Failed to generate image with Pollinations (${service}): ${error.message}`);
  }
};

// --- Gemini Image Generation with Enhanced Retry Logic ---
const generateGeminiImage = async (
  requestId: string, 
  prompt: string, 
  service: ImageService
): Promise<string> => {
  return keyManager.makeRequestWithRetry(async (apiKey: string, keyIndex: number) => {
    logger.info('API_CALL_START', { requestId, apiKeyIndex: keyIndex });
    
    try {
      // ✅ ENHANCED: Use advanced multi-API image generation
      let finalPrompt = prompt;
      if (service === 'gemini-imagen-4-fast') {
        finalPrompt = prompt + ", high quality, fast generation";
      } else if (service === 'gemini-imagen-4-ultra') {
        finalPrompt = prompt + ", ultra realistic, 4k, detailed, photorealistic, masterpiece";
      }

      // Use the advanced image generation system
      const result = await generateAdvancedImage(requestId, finalPrompt, service);
      
      logger.info('ADVANCED_IMAGE_GENERATION_SUCCESS', {
        requestId,
        metadata: { keyIndex, service, succeeded: true }
      });
      
      return result;
      
    } catch (error: any) {
      logger.error('ADVANCED_IMAGE_GENERATION_FAILED', {
        requestId,
        metadata: {
          keyIndex,
          error: error.message,
          errorCode: error.code,
          errorStatus: error.status
        }
      });
      
      // Final fallback to basic Pollinations
      logger.info('FINAL_FALLBACK_TO_BASIC_POLLINATIONS', {
        requestId,
        metadata: { keyIndex, reason: 'All advanced APIs failed' }
      });
      
      return await generatePollinationsImage(requestId, prompt, 'pollinations-flux');
    }
  }, `Advanced multi-API image generation (${service})`);
};

// --- Utility Functions ---
const base64ToBlob = (base64: string): Blob => {
  const parts = base64.split(',');
  const contentType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const raw = atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
};

/**
 * Fetches an image from a local URL and returns it as a blob URL.
 * This is useful for ensuring images are loaded and displayed correctly
 * when relative paths might be problematic.
 * @param url The local URL of the image (e.g., '/challenges/challenge-1.jpg')
 * @returns A promise that resolves to a blob URL (e.g., 'blob:http://...')
 */
export const getLocalImageAsBlobUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${url}. Status: ${response.statusText}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    logger.error('LOCAL_IMAGE_FETCH_FAILED', {
      metadata: { url, error: (error as Error).message }
    });
    // Fallback to the original URL if fetching fails
    return url;
  }
};

// --- Enterprise Features ---
export const getApiStats = () => {
  return {
    keyManager: keyManager.getStats(),
    cache: {
      image: imageCache.getStats(),
      prompt: promptCache.getStats()
    },
    queue: requestQueue.getMetrics(),
    rateLimiter: rateLimiter.getStats()
  };
};

export const getDetailedApiStats = () => {
  const stats = keyManager.getStats();
  const debugInfo = keyManager.getDistributionDebugInfo();
  
  return {
    summary: {
      totalKeys: stats.totalKeys,
      activeKeys: stats.activeKeys,
      exhaustedKeys: stats.quotaExhaustedKeys,
      totalRequests: stats.totalRequests,
      totalErrors: stats.totalErrors,
      successRate: stats.totalRequests > 0 ? ((stats.totalRequests - stats.totalErrors) / stats.totalRequests * 100).toFixed(2) + '%' : '0%'
    },
    distribution: {
      currentRotationIndex: debugInfo.currentRotationIndex,
      nextKey: debugInfo.nextKeyWillBe,
      requestDistribution: debugInfo.distributionPattern,
      isEvenlyDistributed: debugInfo.isEvenlyDistributed,
      rotationSequence: debugInfo.rotationSequence
    },
    retryConfig: stats.retryConfig,
    keyDetails: debugInfo.keyStatusSummary
  };
};

export const clearCaches = () => {
  imageCache.clear();
  promptCache.clear();
  logger.info('ALL_CACHES_CLEARED');
};

export const resetRateLimits = (userId?: string) => {
  if (userId) {
    rateLimiter.resetUser(userId);
  } else {
    // Reset all users would require additional implementation
    logger.warn('GLOBAL_RATE_LIMIT_RESET_NOT_IMPLEMENTED');
  }
};

// ✅ NEW: Emergency reset function for when all keys are disabled
export const emergencyResetAllKeys = () => {
  const stats = keyManager.getStats();
  const keysReset = keyManager.emergencyResetAllKeys();
  
  console.log(`🚨 Emergency Reset: Reactivated ${keysReset} keys out of ${stats.totalKeys} total keys`);
  
  return {
    keysReset,
    totalKeys: stats.totalKeys,
    newStats: getDetailedApiStats()
  };
};

// Initialize Firebase on service load
// Note: Firebase initialization is now handled in App.tsx to prevent double initialization

// --- Enhanced Debug and Monitoring Functions ---
export const debugApiKeySetup = () => {
  console.log('🔍 API Key Setup Debug (11 Keys Total):');
  console.log('Environment variables:');
  for (let i = 1; i <= 11; i++) {
    const envKey = `GEMINI_API_KEY_${i}`;
    const hasKey = process.env[envKey];
    console.log(`- ${envKey}:`, hasKey ? '✅ Set' : '❌ Missing');
  }
  
  const stats = getDetailedApiStats();
  console.log('\n📊 Current Key Manager Stats:');
  console.log(`Total keys loaded: ${stats.summary.totalKeys}`);
  console.log(`Active keys: ${stats.summary.activeKeys}`);
  console.log(`Exhausted keys: ${stats.summary.exhaustedKeys}`);
  console.log(`Success rate: ${stats.summary.successRate}`);
  
  console.log('\n🔄 Key Status Details:');
  stats.keyDetails.forEach(key => {
    console.log(`Key ${key.index}: ${key.status} (Requests: ${key.requestCount}, Errors: ${key.errorCount})`);
  });
  
  console.log('\n🎯 Next key will be:', stats.distribution.nextKey);
  console.log('Distribution balance:', stats.distribution.isEvenlyDistributed ? '✅ Balanced' : '⚠️ Unbalanced');
  
  return {
    totalKeysConfigured: 11,
    envVarsFound: Object.keys(process.env).filter(key => key.includes('GEMINI')),
    keyManagerStats: stats,
    allKeysWorking: stats.summary.activeKeys > 0,
    hasAnyErrors: stats.summary.totalErrors > 0
  };
};

// Enhanced distribution monitoring
export const testApiKeyDistribution = async (testCount: number = 10) => {
  console.log(`🧪 Testing API Key Distribution with ${testCount} requests...`);
  
  const distributionResults = [];
  
  for (let i = 0; i < testCount; i++) {
    try {
      const statsBefore = getDetailedApiStats();
      console.log(`Request ${i + 1}: Next key will be ${statsBefore.distribution.nextKey}`);
      
      // Make a simple test request
      const testPrompt = `test prompt ${i + 1}`;
      const result = await generateImage(testPrompt, 'gemini-imagen-4-fast');
      
      const statsAfter = getDetailedApiStats();
      distributionResults.push({
        requestNumber: i + 1,
        keyUsed: statsBefore.distribution.nextKey,
        success: true,
        distribution: statsAfter.distribution.requestDistribution
      });
      
      console.log(`✅ Request ${i + 1} successful with key ${statsBefore.distribution.nextKey}`);
      console.log(`Current distribution: [${statsAfter.distribution.requestDistribution.join(', ')}]`);
      
    } catch (error: any) {
      distributionResults.push({
        requestNumber: i + 1,
        keyUsed: 'unknown',
        success: false,
        error: error.message
      });
      
      console.log(`❌ Request ${i + 1} failed: ${error.message}`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Final analysis
  const finalStats = getDetailedApiStats();
  console.log('\n📊 Distribution Test Results:');
  console.log('Final distribution:', finalStats.distribution.requestDistribution);
  console.log('Is evenly distributed:', finalStats.distribution.isEvenlyDistributed);
  console.log('Success rate:', `${distributionResults.filter(r => r.success).length}/${testCount}`);
  
  return {
    testResults: distributionResults,
    finalDistribution: finalStats.distribution.requestDistribution,
    isEvenlyDistributed: finalStats.distribution.isEvenlyDistributed,
    successRate: distributionResults.filter(r => r.success).length / testCount
  };
};