import { v4 as uuidv4 } from 'uuid';
import { logger } from './Logger';

export interface QueuedRequest {
  id: string;
  userId: string;
  prompt: string;
  imageData?: string;
  timestamp: number;
  resolve: (result: any) => void;
  reject: (error: any) => void;
  retryCount: number;
  priority: number; // Higher number = higher priority
}

export interface QueueStatus {
  totalRequests: number;
  processingRate: number;
  averageWaitTime: number;
  isProcessing: boolean;
}

export class RequestQueue {
  private static instance: RequestQueue;
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;
  private readonly maxRetries = 3;
  private readonly processingRate = 50; // requests per second
  private readonly processIntervalMs = 1000 / this.processingRate; // 20ms between requests
  
  // Metrics
  private processedRequests = 0;
  private totalWaitTime = 0;
  private processingStartTime = 0;

  private constructor() {
    this.startProcessing();
  }

  static getInstance(): RequestQueue {
    if (!RequestQueue.instance) {
      RequestQueue.instance = new RequestQueue();
    }
    return RequestQueue.instance;
  }

  // Add request to queue
  enqueue<T>(
    userId: string,
    prompt: string,
    processor: () => Promise<T>,
    imageData?: string,
    priority: number = 0
  ): Promise<T> {
    const requestId = uuidv4();
    
    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: requestId,
        userId,
        prompt,
        imageData,
        timestamp: Date.now(),
        resolve: resolve as (result: any) => void,
        reject,
        retryCount: 0,
        priority
      };

      // Insert based on priority (higher priority first)
      const insertIndex = this.queue.findIndex(req => req.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(queuedRequest);
      } else {
        this.queue.splice(insertIndex, 0, queuedRequest);
      }

      logger.logRequestQueued(requestId, this.queue.length);
      
      // Store processor function
      (queuedRequest as any).processor = processor;
    });
  }

  // Get queue position for a request
  getQueuePosition(requestId: string): number {
    const index = this.queue.findIndex(req => req.id === requestId);
    return index === -1 ? -1 : index + 1;
  }

  // Get queue status
  getStatus(): QueueStatus {
    const averageWaitTime = this.processedRequests > 0 ? 
      this.totalWaitTime / this.processedRequests : 0;

    return {
      totalRequests: this.queue.length,
      processingRate: this.processingRate,
      averageWaitTime,
      isProcessing: this.isProcessing
    };
  }

  // Start processing queue
  private startProcessing(): void {
    if (this.processInterval) {
      return;
    }

    this.processingStartTime = Date.now();
    this.processInterval = setInterval(() => {
      this.processNext();
    }, this.processIntervalMs);

    logger.info('QUEUE_PROCESSING_STARTED', {
      metadata: { processingRate: this.processingRate }
    });
  }

  // Process next request in queue
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const request = this.queue.shift()!;
    const processor = (request as any).processor;

    try {
      logger.info('QUEUE_PROCESSING_REQUEST', {
        requestId: request.id,
        userId: request.userId,
        metadata: { 
          queueWaitTime: Date.now() - request.timestamp,
          retryCount: request.retryCount
        }
      });

      const startTime = Date.now();
      const result = await processor();
      const processingTime = Date.now() - startTime;
      const totalTime = Date.now() - request.timestamp;

      // Update metrics
      this.processedRequests++;
      this.totalWaitTime += totalTime;

      logger.info('QUEUE_REQUEST_COMPLETED', {
        requestId: request.id,
        userId: request.userId,
        processingTime,
        metadata: { totalTime }
      });

      request.resolve(result);

    } catch (error: any) {
      logger.error('QUEUE_REQUEST_FAILED', {
        requestId: request.id,
        userId: request.userId,
        metadata: { 
          error: error.message, 
          retryCount: request.retryCount 
        }
      });

      // Retry logic
      if (request.retryCount < this.maxRetries) {
        request.retryCount++;
        // Add back to front of queue for retry
        this.queue.unshift(request);
        logger.info('QUEUE_REQUEST_RETRY', {
          requestId: request.id,
          metadata: { retryCount: request.retryCount }
        });
      } else {
        request.reject(new Error(`Request failed after ${this.maxRetries} retries: ${error.message}`));
      }
    }
  }

  // Emergency stop processing
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
      this.isProcessing = false;
      
      logger.warn('QUEUE_PROCESSING_STOPPED');
    }
  }

  // Clear all pending requests
  clearQueue(): void {
    const clearedCount = this.queue.length;
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    
    logger.warn('QUEUE_CLEARED', {
      metadata: { clearedCount }
    });
  }

  // Get queue metrics for monitoring
  getMetrics() {
    const uptimeMs = Date.now() - this.processingStartTime;
    const uptimeHours = uptimeMs / (1000 * 60 * 60);
    const requestsPerHour = this.processedRequests / uptimeHours;

    return {
      queueLength: this.queue.length,
      processedRequests: this.processedRequests,
      averageWaitTime: this.processedRequests > 0 ? this.totalWaitTime / this.processedRequests : 0,
      uptimeHours: uptimeHours,
      requestsPerHour: requestsPerHour,
      isProcessing: this.isProcessing,
      processingRate: this.processingRate
    };
  }

  // Priority request (for admin/system requests)
  enqueuePriority<T>(
    userId: string,
    prompt: string,
    processor: () => Promise<T>,
    imageData?: string
  ): Promise<T> {
    return this.enqueue(userId, prompt, processor, imageData, 1000);
  }
}

export const requestQueue = RequestQueue.getInstance();