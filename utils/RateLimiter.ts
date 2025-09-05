import { logger } from './Logger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
  blockDurationMs: number; // How long to block after limit exceeded
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

export interface UserRateData {
  requests: number[];
  blockUntil?: number;
  totalRequests: number;
  firstRequest: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private userLimits = new Map<string, UserRateData>();
  private readonly config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout;

  private constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequests: 5,
      windowMs: 60 * 1000, // 1 minute
      blockDurationMs: 60 * 1000, // 1 minute block
      ...config
    };

    // Clean up old data every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);

    logger.info('RATE_LIMITER_INITIALIZED', {
      metadata: this.config
    });
  }

  static getInstance(config?: Partial<RateLimitConfig>): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter(config);
    }
    return RateLimiter.instance;
  }

  // Check if user can make a request
  checkLimit(userId: string): RateLimitInfo {
    const now = Date.now();
    const userData = this.getUserData(userId);

    // Check if user is currently blocked
    if (userData.blockUntil && now < userData.blockUntil) {
      const cooldownTime = userData.blockUntil - now;
      
      logger.logRateLimitExceeded(userId, cooldownTime);
      
      return {
        remaining: 0,
        resetTime: userData.blockUntil,
        blocked: true,
        blockUntil: userData.blockUntil
      };
    }

    // Clean up old requests outside the window
    const windowStart = now - this.config.windowMs;
    userData.requests = userData.requests.filter(timestamp => timestamp > windowStart);

    // Check if limit would be exceeded
    if (userData.requests.length >= this.config.maxRequests) {
      // Block the user
      userData.blockUntil = now + this.config.blockDurationMs;
      
      logger.logRateLimitExceeded(userId, this.config.blockDurationMs);
      
      return {
        remaining: 0,
        resetTime: userData.blockUntil,
        blocked: true,
        blockUntil: userData.blockUntil
      };
    }

    // Calculate remaining requests and reset time
    const remaining = this.config.maxRequests - userData.requests.length;
    const oldestRequest = userData.requests[0];
    const resetTime = oldestRequest ? oldestRequest + this.config.windowMs : now + this.config.windowMs;

    logger.logRateLimit(userId, remaining, resetTime);

    return {
      remaining,
      resetTime,
      blocked: false
    };
  }

  // Record a request for a user
  recordRequest(userId: string): boolean {
    const limitInfo = this.checkLimit(userId);
    
    if (limitInfo.blocked) {
      return false;
    }

    const now = Date.now();
    const userData = this.getUserData(userId);
    
    userData.requests.push(now);
    userData.totalRequests++;
    
    // Update first request time if this is the first
    if (userData.totalRequests === 1) {
      userData.firstRequest = now;
    }

    logger.info('RATE_LIMIT_REQUEST_RECORDED', {
      userId,
      metadata: {
        currentRequests: userData.requests.length,
        totalRequests: userData.totalRequests,
        remaining: this.config.maxRequests - userData.requests.length
      }
    });

    return true;
  }

  // Get user rate limit data
  private getUserData(userId: string): UserRateData {
    if (!this.userLimits.has(userId)) {
      this.userLimits.set(userId, {
        requests: [],
        totalRequests: 0,
        firstRequest: Date.now()
      });
    }
    return this.userLimits.get(userId)!;
  }

  // Clean up old user data
  private cleanup(): void {
    const now = Date.now();
    let cleanedUsers = 0;

    for (const [userId, userData] of this.userLimits) {
      // Remove users who haven't made requests in the last hour
      const lastRequest = userData.requests[userData.requests.length - 1];
      const inactive = !lastRequest || (now - lastRequest) > (60 * 60 * 1000);
      
      // Also remove if block period has expired and no recent requests
      const blockExpired = !userData.blockUntil || now > userData.blockUntil;
      
      if (inactive && blockExpired) {
        this.userLimits.delete(userId);
        cleanedUsers++;
      } else if (userData.blockUntil && now > userData.blockUntil) {
        // Clear expired block
        delete userData.blockUntil;
      }
    }

    if (cleanedUsers > 0) {
      logger.info('RATE_LIMITER_CLEANUP', {
        metadata: { 
          cleanedUsers,
          activeUsers: this.userLimits.size 
        }
      });
    }
  }

  // Get rate limit status for a user
  getStatus(userId: string): RateLimitInfo {
    return this.checkLimit(userId);
  }

  // Get all rate limit stats
  getStats() {
    const now = Date.now();
    let totalActiveUsers = 0;
    let totalBlockedUsers = 0;
    let totalRequests = 0;

    for (const [userId, userData] of this.userLimits) {
      totalRequests += userData.totalRequests;
      
      if (userData.blockUntil && now < userData.blockUntil) {
        totalBlockedUsers++;
      } else {
        totalActiveUsers++;
      }
    }

    return {
      totalUsers: this.userLimits.size,
      activeUsers: totalActiveUsers,
      blockedUsers: totalBlockedUsers,
      totalRequests,
      config: this.config
    };
  }

  // Reset limit for a specific user (admin function)
  resetUser(userId: string): void {
    this.userLimits.delete(userId);
    logger.warn('RATE_LIMIT_USER_RESET', { userId });
  }

  // Update rate limit configuration
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    Object.assign(this.config, newConfig);
    logger.info('RATE_LIMIT_CONFIG_UPDATED', {
      metadata: this.config
    });
  }

  // Check if user is currently blocked
  isBlocked(userId: string): boolean {
    const userData = this.userLimits.get(userId);
    if (!userData || !userData.blockUntil) return false;
    
    return Date.now() < userData.blockUntil;
  }

  // Get cooldown time remaining for blocked user
  getCooldownTime(userId: string): number {
    const userData = this.userLimits.get(userId);
    if (!userData || !userData.blockUntil) return 0;
    
    return Math.max(0, userData.blockUntil - Date.now());
  }

  // Priority bypass for admin/system requests
  bypassLimit(userId: string, reason: string): void {
    const userData = this.getUserData(userId);
    delete userData.blockUntil;
    userData.requests = [];
    
    logger.warn('RATE_LIMIT_BYPASSED', {
      userId,
      metadata: { reason }
    });
  }

  // Destroy instance (for testing)
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.userLimits.clear();
  }
}

export const rateLimiter = RateLimiter.getInstance();