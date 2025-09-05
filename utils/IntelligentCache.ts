import { logger } from './Logger';

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // in bytes
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
}

export class IntelligentCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number; // Max cache size in bytes
  private readonly maxEntries: number; // Max number of entries
  private readonly ttlMs: number; // Time to live in milliseconds
  
  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private currentSize = 0;

  constructor(
    maxSizeMB: number = 100, // 100MB default
    maxEntries: number = 1000, // 1000 entries default
    ttlMinutes: number = 60 // 60 minutes default
  ) {
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMinutes * 60 * 1000; // Convert to milliseconds

    // Start cleanup interval
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Cleanup every 5 minutes
  }

  // Generate cache key from prompt and optional image data
  generateKey(prompt: string, imageData?: string, userId?: string): string {
    const components = [prompt];
    if (imageData) components.push(imageData);
    if (userId) components.push(userId);
    
    // Simple hash function for cache key
    return this.simpleHash(components.join('|'));
  }

  // Simple hash function
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Calculate size of value in bytes
  private calculateSize(value: T): number {
    return new Blob([JSON.stringify(value)]).size;
  }

  // Get value from cache
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      logger.logCacheCheck('', 'MISS', key);
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      this.misses++;
      logger.logCacheCheck('', 'MISS', key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.hits++;
    
    logger.logCacheCheck('', 'HIT', key);
    return entry.value;
  }

  // Set value in cache
  set(key: string, value: T): void {
    const size = this.calculateSize(value);
    const now = Date.now();

    // Check if we need to make space
    this.makeSpace(size);

    // Create new entry
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
      size
    };

    // Remove existing entry if it exists
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.currentSize -= existingEntry.size;
    }

    // Add new entry
    this.cache.set(key, entry);
    this.currentSize += size;

    logger.debug('CACHE_SET', {
      metadata: { 
        key, 
        size, 
        totalSize: this.currentSize,
        totalEntries: this.cache.size 
      }
    });
  }

  // Make space for new entry
  private makeSpace(requiredSize: number): void {
    // Check size limit
    while (this.currentSize + requiredSize > this.maxSize && this.cache.size > 0) {
      this.evictLeastRecentlyUsed();
    }

    // Check entry count limit
    while (this.cache.size >= this.maxEntries) {
      this.evictLeastRecentlyUsed();
    }
  }

  // Evict least recently used entry
  private evictLeastRecentlyUsed(): void {
    let oldestEntry: CacheEntry<T> | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.cache) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldestEntry) {
      this.cache.delete(oldestKey);
      this.currentSize -= oldestEntry.size;
      this.evictions++;
      
      logger.debug('CACHE_EVICTION', {
        metadata: { 
          key: oldestKey, 
          reason: 'LRU',
          size: oldestEntry.size 
        }
      });
    }
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    let cleanedSize = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        this.currentSize -= entry.size;
        cleanedCount++;
        cleanedSize += entry.size;
      }
    }

    if (cleanedCount > 0) {
      logger.info('CACHE_CLEANUP', {
        metadata: { 
          cleanedCount, 
          cleanedSize,
          remainingEntries: this.cache.size 
        }
      });
    }
  }

  // Check if key exists in cache
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      return false;
    }
    
    return true;
  }

  // Delete specific key
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      return true;
    }
    return false;
  }

  // Clear all entries
  clear(): void {
    const clearedCount = this.cache.size;
    const clearedSize = this.currentSize;
    
    this.cache.clear();
    this.currentSize = 0;
    
    logger.info('CACHE_CLEARED', {
      metadata: { clearedCount, clearedSize }
    });
  }

  // Get cache statistics
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    
    return {
      totalEntries: this.cache.size,
      totalSize: this.currentSize,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.misses / totalRequests : 0,
      evictionCount: this.evictions
    };
  }

  // Get cache info for monitoring
  getInfo() {
    const stats = this.getStats();
    const entries: any[] = [];
    
    for (const [key, entry] of this.cache) {
      entries.push({
        key,
        size: entry.size,
        age: Date.now() - entry.timestamp,
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed
      });
    }

    return {
      ...stats,
      maxSize: this.maxSize,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
      entries: entries.sort((a, b) => b.accessCount - a.accessCount)
    };
  }

  // Preload cache with common data
  preload(data: Array<{ key: string; value: T }>): void {
    for (const item of data) {
      this.set(item.key, item.value);
    }
    
    logger.info('CACHE_PRELOADED', {
      metadata: { count: data.length }
    });
  }
}

// Create global instances for different data types
export const imageCache = new IntelligentCache<any>(50, 500, 120); // 50MB, 500 entries, 2 hours
export const promptCache = new IntelligentCache<any>(20, 1000, 60); // 20MB, 1000 entries, 1 hour
export const userCache = new IntelligentCache<any>(10, 100, 30); // 10MB, 100 entries, 30 minutes