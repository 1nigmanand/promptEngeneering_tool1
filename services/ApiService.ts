import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { ImageService } from '../types';
import { logger } from '../utils/Logger';
import { requestQueue } from '../utils/RequestQueue';
import { imageCache, promptCache } from '../utils/IntelligentCache';
import { rateLimiter } from '../utils/RateLimiter';
import { responseOptimizer } from '../utils/ResponseOptimizer';
import { firebaseIntegration } from './firebaseService';

// --- API Key Management ---
interface ApiKeyInfo {
  key: string;
  index: number;
  isActive: boolean;
  lastUsed: number;
  errorCount: number;
  quotaExhausted: boolean;
}

class ApiKeyManager {
  private keys: ApiKeyInfo[] = [];
  private currentIndex = 0;
  private maxErrors = 3;
  private quotaCooldown = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys(): void {
    const keyEnvs = [
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4
    ];

    this.keys = keyEnvs
      .map((key, index) => key ? {
        key,
        index,
        isActive: true,
        lastUsed: 0,
        errorCount: 0,
        quotaExhausted: false
      } : null)
      .filter((key): key is ApiKeyInfo => key !== null);

    if (this.keys.length === 0) {
      // Fallback to single API key
      const fallbackKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (fallbackKey) {
        this.keys.push({
          key: fallbackKey,
          index: 0,
          isActive: true,
          lastUsed: 0,
          errorCount: 0,
          quotaExhausted: false
        });
      }
    }

    logger.info('API_KEY_MANAGER_INITIALIZED', {
      metadata: { 
        totalKeys: this.keys.length,
        activeKeys: this.keys.filter(k => k.isActive).length
      }
    });
  }

  getCurrentKey(): ApiKeyInfo | null {
    const activeKeys = this.keys.filter(k => k.isActive && !k.quotaExhausted);
    
    if (activeKeys.length === 0) {
      // Check if any quota cooldowns have expired
      const now = Date.now();
      this.keys.forEach(key => {
        if (key.quotaExhausted && (now - key.lastUsed) > this.quotaCooldown) {
          key.quotaExhausted = false;
          key.errorCount = 0;
          key.isActive = true;
        }
      });
      
      const recoveredKeys = this.keys.filter(k => k.isActive && !k.quotaExhausted);
      if (recoveredKeys.length === 0) {
        return null;
      }
    }

    const availableKeys = this.keys.filter(k => k.isActive && !k.quotaExhausted);
    
    if (availableKeys.length === 0) {
      return null;
    }

    // Round-robin rotation
    const key = availableKeys[this.currentIndex % availableKeys.length];
    this.currentIndex = (this.currentIndex + 1) % availableKeys.length;
    
    return key;
  }

  recordError(keyIndex: number, isQuotaError: boolean = false): void {
    const key = this.keys.find(k => k.index === keyIndex);
    if (!key) return;

    key.errorCount++;
    key.lastUsed = Date.now();

    if (isQuotaError) {
      key.quotaExhausted = true;
      logger.logApiKeyRotation(keyIndex, -1, 'quota_exhausted');
    }

    if (key.errorCount >= this.maxErrors) {
      key.isActive = false;
      logger.logApiKeyRotation(keyIndex, -1, 'max_errors_reached');
    }
  }

  recordSuccess(keyIndex: number): void {
    const key = this.keys.find(k => k.index === keyIndex);
    if (!key) return;

    key.errorCount = 0;
    key.lastUsed = Date.now();
  }

  getStats() {
    return {
      totalKeys: this.keys.length,
      activeKeys: this.keys.filter(k => k.isActive).length,
      quotaExhaustedKeys: this.keys.filter(k => k.quotaExhausted).length,
      keyStats: this.keys.map(k => ({
        index: k.index,
        isActive: k.isActive,
        errorCount: k.errorCount,
        quotaExhausted: k.quotaExhausted,
        lastUsed: k.lastUsed
      }))
    };
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

// --- Pollinations Image Generation ---
const generatePollinationsImage = async (
  requestId: string, 
  prompt: string, 
  service: ImageService
): Promise<string> => {
  try {
    const model = service.substring('pollinations-'.length);
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${model}`;
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to generate image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const binaryString = Array.from(uint8Array).map((byte) => String.fromCharCode(byte)).join('');
    const base64 = btoa(binaryString);
    
    return `data:image/png;base64,${base64}`;
  } catch (error: any) {
    logger.error('POLLINATIONS_GENERATION_FAILED', {
      requestId,
      metadata: { error: error.message, service }
    });
    throw new Error(`Failed to generate image with Pollinations: ${error.message}`);
  }
};

// --- Gemini Image Generation with Retry Logic ---
const generateGeminiImage = async (
  requestId: string, 
  prompt: string, 
  service: ImageService
): Promise<string> => {
  const maxRetries = 4; // Try all available keys
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentKey = keyManager.getCurrentKey();
    
    if (!currentKey) {
      throw new Error('All API keys exhausted. Please try again later.');
    }

    let startTime: number;
    try {
      logger.logApiCall(requestId, currentKey.index);
      startTime = Date.now();
      
      let finalPrompt = prompt;
      if (service === 'gemini-imagen-4-fast') {
        finalPrompt = prompt + ", simple, quick sketch, minimalist style. Don't add any additional effects or styles";
      } else if (service === 'gemini-imagen-4-ultra') {
        finalPrompt = prompt + ", ultra realistic, 4k, detailed, photorealistic. Don't add any additional effects or styles";
      }

      const gemini = getAiClient(currentKey.key);
      const response = await gemini.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: finalPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
      });

      if (!response.generatedImages || response.generatedImages.length === 0 || 
          !response.generatedImages[0].image.imageBytes) {
        throw new Error('No image returned from Gemini');
      }

      const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
      const processingTime = Date.now() - startTime;
      
      keyManager.recordSuccess(currentKey.index);
      logger.logApiResponse(requestId, currentKey.index, processingTime, true);
      
      return `data:image/jpeg;base64,${base64ImageBytes}`;

    } catch (error: any) {
      lastError = error;
      
      // Calculate processing time, defaulting to 0 if startTime not set
      const processingTime = startTime ? Date.now() - startTime : 0;
      
      // Check if it's a quota error
      const isQuotaError = error.message.includes('quota') || 
                          error.message.includes('limit') ||
                          error.status === 429;
      
      keyManager.recordError(currentKey.index, isQuotaError);
      logger.logApiResponse(requestId, currentKey.index, processingTime, false);
      
      if (attempt === maxRetries - 1) {
        break; // Last attempt, don't continue
      }
      
      logger.warn('GEMINI_KEY_FAILED_RETRYING', {
        requestId,
        metadata: { 
          keyIndex: currentKey.index,
          attempt: attempt + 1,
          error: error.message,
          isQuotaError
        }
      });
    }
  }

  logger.error('GEMINI_ALL_KEYS_EXHAUSTED', {
    requestId,
    metadata: { 
      attempts: maxRetries,
      finalError: lastError!.message 
    }
  });
  
  throw new Error(`Failed to generate image with Gemini after trying all available API keys: ${lastError!.message}`);
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

// Initialize Firebase on service load
// Note: Firebase initialization is now handled in App.tsx to prevent double initialization