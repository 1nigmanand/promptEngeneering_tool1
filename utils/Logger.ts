export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  event: string;
  userId?: string;
  requestId?: string;
  apiKeyIndex?: number;
  cacheStatus?: 'HIT' | 'MISS';
  processingTime?: number;
  metadata?: Record<string, any>;
}

export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs = 10000; // Keep last 10k logs in memory

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogEntry(
    level: LogEntry['level'],
    event: string,
    metadata?: Partial<LogEntry>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...metadata,
    };
  }

  info(event: string, metadata?: Partial<LogEntry>): void {
    this.log('INFO', event, metadata);
  }

  warn(event: string, metadata?: Partial<LogEntry>): void {
    this.log('WARN', event, metadata);
  }

  error(event: string, metadata?: Partial<LogEntry>): void {
    this.log('ERROR', event, metadata);
  }

  debug(event: string, metadata?: Partial<LogEntry>): void {
    this.log('DEBUG', event, metadata);
  }

  private log(level: LogEntry['level'], event: string, metadata?: Partial<LogEntry>): void {
    const entry = this.createLogEntry(level, event, metadata);
    
    // Add to memory store
    this.logs.push(entry);
    
    // Maintain max log limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output for development
    const logMethod = level === 'ERROR' ? console.error : 
                     level === 'WARN' ? console.warn : console.log;
    
    logMethod(`[${entry.timestamp}] ${level}: ${event}`, metadata || '');
  }

  // Request lifecycle logging methods
  logRequestReceived(requestId: string, userId: string, prompt: string): void {
    this.info('REQUEST_RECEIVED', {
      requestId,
      userId,
      metadata: { promptLength: prompt.length }
    });
  }

  logRequestQueued(requestId: string, queuePosition: number): void {
    this.info('REQUEST_QUEUED', {
      requestId,
      metadata: { queuePosition }
    });
  }

  logCacheCheck(requestId: string, cacheStatus: 'HIT' | 'MISS', cacheKey?: string): void {
    this.info('CACHE_CHECK', {
      requestId,
      cacheStatus,
      metadata: { cacheKey }
    });
  }

  logApiCall(requestId: string, apiKeyIndex: number): void {
    this.info('API_CALL_START', {
      requestId,
      apiKeyIndex
    });
  }

  logApiResponse(requestId: string, apiKeyIndex: number, processingTime: number, success: boolean): void {
    this.info(success ? 'API_CALL_SUCCESS' : 'API_CALL_FAILED', {
      requestId,
      apiKeyIndex,
      processingTime
    });
  }

  logApiKeyRotation(fromIndex: number, toIndex: number, reason: string): void {
    this.warn('API_KEY_ROTATION', {
      metadata: { fromIndex, toIndex, reason }
    });
  }

  logResponseSent(requestId: string, processingTime: number, cacheStatus?: 'HIT' | 'MISS'): void {
    this.info('RESPONSE_SENT', {
      requestId,
      cacheStatus,
      processingTime
    });
  }

  logRateLimit(userId: string, remainingRequests: number, resetTime: number): void {
    this.warn('RATE_LIMIT_CHECK', {
      userId,
      metadata: { remainingRequests, resetTime }
    });
  }

  logRateLimitExceeded(userId: string, cooldownTime: number): void {
    this.error('RATE_LIMIT_EXCEEDED', {
      userId,
      metadata: { cooldownTime }
    });
  }

  // Get recent logs for monitoring
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  // Get logs by criteria
  getLogsByRequestId(requestId: string): LogEntry[] {
    return this.logs.filter(log => log.requestId === requestId);
  }

  getLogsByUserId(userId: string): LogEntry[] {
    return this.logs.filter(log => log.userId === userId);
  }

  getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  // Export logs for analysis
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Clear logs (for maintenance)
  clearLogs(): void {
    this.logs = [];
    this.info('LOGS_CLEARED');
  }
}

export const logger = Logger.getInstance();