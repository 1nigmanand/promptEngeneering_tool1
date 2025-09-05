import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  Firestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { 
  getStorage, 
  FirebaseStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/Logger';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface UserRequestData {
  requestId: string;
  userId: string;
  prompt: string;
  similarityScore: number;
  timestamp: Timestamp;
  cacheStatus: 'HIT' | 'MISS';
  imagePath: string;
  processingTime: number;
  apiKeyIndex: number;
}

export interface FirebaseStorageResult {
  downloadURL: string;
  fullPath: string;
  size: number;
}

export class FirebaseIntegration {
  private static instance: FirebaseIntegration;
  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  private storage: FirebaseStorage | null = null;
  private initialized = false;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 second

  private constructor() {}

  static getInstance(): FirebaseIntegration {
    if (!FirebaseIntegration.instance) {
      FirebaseIntegration.instance = new FirebaseIntegration();
    }
    return FirebaseIntegration.instance;
  }

  // Initialize Firebase with configuration
  async initialize(config: FirebaseConfig): Promise<void> {
    try {
      if (this.initialized) {
        logger.warn('FIREBASE_ALREADY_INITIALIZED');
        return;
      }

      this.app = initializeApp(config);
      this.db = getFirestore(this.app);
      this.storage = getStorage(this.app);
      this.initialized = true;

      logger.info('FIREBASE_INITIALIZED', {
        metadata: { projectId: config.projectId }
      });

    } catch (error: any) {
      logger.error('FIREBASE_INITIALIZATION_FAILED', {
        metadata: { error: error.message }
      });
      throw new Error(`Firebase initialization failed: ${error.message}`);
    }
  }

  // Initialize with environment variables
  async initializeFromEnv(): Promise<void> {
    const config: FirebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID || ''
    };

    // Validate configuration
    const missingFields = Object.entries(config)
      .filter(([_, value]) => !value)
      .map(([key, _]) => key);

    if (missingFields.length > 0) {
      throw new Error(`Missing Firebase configuration: ${missingFields.join(', ')}`);
    }

    await this.initialize(config);
  }

  // Retry wrapper for Firebase operations
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    requestId?: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info('FIREBASE_RETRY_SUCCESS', {
            requestId,
            metadata: { operationName, attempt }
          });
        }
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        logger.warn('FIREBASE_OPERATION_FAILED', {
          requestId,
          metadata: { 
            operationName, 
            attempt, 
            error: error.message 
          }
        });

        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    logger.error('FIREBASE_OPERATION_EXHAUSTED', {
      requestId,
      metadata: { 
        operationName, 
        attempts: this.retryAttempts,
        finalError: lastError!.message 
      }
    });

    throw lastError!;
  }

  // Save user request data to Firestore
  async saveUserRequest(data: Omit<UserRequestData, 'timestamp'>): Promise<void> {
    if (!this.db) throw new Error('Firebase not initialized');

    const requestData: UserRequestData = {
      ...data,
      timestamp: serverTimestamp() as Timestamp
    };

    await this.withRetry(async () => {
      const docRef = doc(this.db!, 'users', data.userId, 'requests', data.requestId);
      await setDoc(docRef, requestData);
    }, 'saveUserRequest', data.requestId);

    logger.info('FIREBASE_REQUEST_SAVED', {
      requestId: data.requestId,
      userId: data.userId,
      metadata: { 
        similarityScore: data.similarityScore,
        cacheStatus: data.cacheStatus 
      }
    });
  }

  // Update user request similarity score
  async updateUserRequestScore(
    userId: string, 
    requestId: string, 
    similarityScore: number
  ): Promise<void> {
    if (!this.db) throw new Error('Firebase not initialized');

    await this.withRetry(async () => {
      const docRef = doc(this.db!, 'users', userId, 'requests', requestId);
      await updateDoc(docRef, {
        similarityScore: similarityScore
      });
    }, 'updateUserRequestScore', requestId);

    logger.info('FIREBASE_SIMILARITY_SCORE_UPDATED', {
      requestId,
      userId,
      metadata: { similarityScore }
    });
  }

  // Get user request data
  async getUserRequest(userId: string, requestId: string): Promise<UserRequestData | null> {
    if (!this.db) throw new Error('Firebase not initialized');

    return await this.withRetry(async () => {
      const docRef = doc(this.db!, 'users', userId, 'requests', requestId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }

      return docSnap.data() as UserRequestData;
    }, 'getUserRequest', requestId);
  }

  // Get user's recent requests
  async getUserRequests(
    userId: string, 
    limitCount: number = 50
  ): Promise<UserRequestData[]> {
    if (!this.db) throw new Error('Firebase not initialized');

    return await this.withRetry(async () => {
      const requestsRef = collection(this.db!, 'users', userId, 'requests');
      const q = query(
        requestsRef,
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => doc.data() as UserRequestData);
    }, 'getUserRequests');
  }

  // Upload image to Firebase Storage
  async uploadImage(
    imageData: Blob | Uint8Array | ArrayBuffer,
    userId: string,
    requestId: string
  ): Promise<FirebaseStorageResult> {
    if (!this.storage) throw new Error('Firebase not initialized');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const imagePath = `images/${userId}/${year}/${month}/${day}/${requestId}.png`;

    return await this.withRetry(async () => {
      const storageRef = ref(this.storage!, imagePath);
      const uploadResult = await uploadBytes(storageRef, imageData);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      return {
        downloadURL,
        fullPath: uploadResult.ref.fullPath,
        size: uploadResult.metadata.size || 0
      };
    }, 'uploadImage', requestId);
  }

  // Get image download URL
  async getImageURL(imagePath: string): Promise<string> {
    if (!this.storage) throw new Error('Firebase not initialized');

    return await this.withRetry(async () => {
      const storageRef = ref(this.storage!, imagePath);
      return await getDownloadURL(storageRef);
    }, 'getImageURL');
  }

  // Delete image from Storage
  async deleteImage(imagePath: string): Promise<void> {
    if (!this.storage) throw new Error('Firebase not initialized');

    await this.withRetry(async () => {
      const storageRef = ref(this.storage!, imagePath);
      await deleteObject(storageRef);
    }, 'deleteImage');
  }

  // Save user progress data
  async saveUserProgress(
    userId: string, 
    progressData: Record<string, any>
  ): Promise<void> {
    if (!this.db) throw new Error('Firebase not initialized');

    await this.withRetry(async () => {
      const docRef = doc(this.db!, 'users', userId, 'profile', 'progress');
      await setDoc(docRef, {
        ...progressData,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    }, 'saveUserProgress');

    logger.info('FIREBASE_PROGRESS_SAVED', {
      userId,
      metadata: { progressKeys: Object.keys(progressData) }
    });
  }

  // Get user progress data
  async getUserProgress(userId: string): Promise<Record<string, any> | null> {
    if (!this.db) throw new Error('Firebase not initialized');

    return await this.withRetry(async () => {
      const docRef = doc(this.db!, 'users', userId, 'profile', 'progress');
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      delete data.lastUpdated; // Remove internal timestamp
      return data;
    }, 'getUserProgress');
  }

  // Batch save multiple requests (for performance)
  async batchSaveRequests(requests: Array<Omit<UserRequestData, 'timestamp'>>): Promise<void> {
    if (!this.db) throw new Error('Firebase not initialized');

    await this.withRetry(async () => {
      // Firebase batch writes have a limit of 500 operations
      const batchSize = 500;
      const batches = [];

      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchPromises = batch.map(async (requestData) => {
          const docRef = doc(this.db!, 'users', requestData.userId, 'requests', requestData.requestId);
          const dataWithTimestamp = {
            ...requestData,
            timestamp: serverTimestamp()
          };
          await setDoc(docRef, dataWithTimestamp);
        });
        
        batches.push(Promise.all(batchPromises));
      }

      await Promise.all(batches);
    }, 'batchSaveRequests');

    logger.info('FIREBASE_BATCH_SAVED', {
      metadata: { requestCount: requests.length }
    });
  }

  // Get analytics data
  async getAnalytics(userId?: string): Promise<any> {
    if (!this.db) throw new Error('Firebase not initialized');

    return await this.withRetry(async () => {
      let requestsRef;
      
      if (userId) {
        requestsRef = collection(this.db!, 'users', userId, 'requests');
      } else {
        // This would require a different structure for global analytics
        // For now, return user-specific analytics
        throw new Error('Global analytics not implemented yet');
      }

      const q = query(requestsRef, orderBy('timestamp', 'desc'), limit(1000));
      const snapshot = await getDocs(q);
      
      const requests = snapshot.docs.map(doc => doc.data() as UserRequestData);
      
      // Calculate analytics
      const totalRequests = requests.length;
      const cacheHits = requests.filter(r => r.cacheStatus === 'HIT').length;
      const avgSimilarityScore = requests.reduce((sum, r) => sum + (r.similarityScore || 0), 0) / totalRequests;
      const avgProcessingTime = requests.reduce((sum, r) => sum + (r.processingTime || 0), 0) / totalRequests;

      return {
        totalRequests,
        cacheHitRate: totalRequests > 0 ? cacheHits / totalRequests : 0,
        avgSimilarityScore: avgSimilarityScore || 0,
        avgProcessingTime: avgProcessingTime || 0,
        apiKeyUsage: this.calculateApiKeyUsage(requests)
      };
    }, 'getAnalytics');
  }

  // Calculate API key usage statistics
  private calculateApiKeyUsage(requests: UserRequestData[]): Record<number, number> {
    const usage: Record<number, number> = {};
    
    requests.forEach(request => {
      const keyIndex = request.apiKeyIndex;
      if (keyIndex !== undefined) {
        usage[keyIndex] = (usage[keyIndex] || 0) + 1;
      }
    });

    return usage;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    if (!this.initialized || !this.db) {
      return false;
    }

    try {
      // Simple read operation to test connectivity
      const testDoc = doc(this.db, 'health', 'check');
      await getDoc(testDoc);
      return true;
    } catch (error) {
      logger.error('FIREBASE_HEALTH_CHECK_FAILED', {
        metadata: { error: (error as Error).message }
      });
      return false;
    }
  }

  // Get connection status
  isInitialized(): boolean {
    return this.initialized && !!this.app && !!this.db && !!this.storage;
  }
}

export const firebaseIntegration = FirebaseIntegration.getInstance();