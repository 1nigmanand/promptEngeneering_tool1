import imageCompression from 'browser-image-compression';
import { logger } from './Logger';

export interface CompressionOptions {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  useWebWorker: boolean;
  quality: number;
}

export interface OptimizationResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  optimizedData: string | Blob;
  format: string;
  processingTime: number;
}

export class ResponseOptimizer {
  private static instance: ResponseOptimizer;
  private readonly defaultOptions: CompressionOptions = {
    maxSizeMB: 1, // 1MB max
    maxWidthOrHeight: 1920, // 1920px max dimension
    useWebWorker: true,
    quality: 0.8 // 80% quality
  };

  private constructor() {}

  static getInstance(): ResponseOptimizer {
    if (!ResponseOptimizer.instance) {
      ResponseOptimizer.instance = new ResponseOptimizer();
    }
    return ResponseOptimizer.instance;
  }

  // Optimize image response
  async optimizeImage(
    imageData: string | Blob | File,
    options?: Partial<CompressionOptions>
  ): Promise<OptimizationResult> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    try {
      let imageFile: File;
      let originalSize: number;

      // Convert input to File object with proper type checking
      if (typeof imageData === 'string') {
        // Base64 string
        const blob = this.base64ToBlob(imageData);
        originalSize = blob.size;
        imageFile = new File([blob], 'image.png', { type: blob.type });
      } else if (imageData instanceof File) {
        originalSize = imageData.size;
        imageFile = imageData;
      } else if (imageData instanceof Blob) {
        originalSize = imageData.size;
        imageFile = new File([imageData], 'image.png', { type: imageData.type });
      } else {
        throw new Error('Unsupported image data type');
      }

      // Skip compression if already small enough
      if (originalSize <= opts.maxSizeMB * 1024 * 1024) {
        const processingTime = Date.now() - startTime;
        
        logger.debug('IMAGE_OPTIMIZATION_SKIPPED', {
          metadata: { 
            originalSize, 
            reason: 'already_optimized',
            processingTime 
          }
        });

        return {
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          optimizedData: imageData,
          format: imageFile.type,
          processingTime
        };
      }

      // Compress the image
      const compressedFile = await imageCompression(imageFile, {
        maxSizeMB: opts.maxSizeMB,
        maxWidthOrHeight: opts.maxWidthOrHeight,
        useWebWorker: opts.useWebWorker,
        initialQuality: opts.quality
      });

      const compressedSize = compressedFile.size;
      const compressionRatio = originalSize / compressedSize;
      const processingTime = Date.now() - startTime;

      // Convert back to base64 if original was base64
      let optimizedData: string | Blob = compressedFile;
      if (typeof imageData === 'string') {
        optimizedData = await this.blobToBase64(compressedFile);
      }

      logger.info('IMAGE_OPTIMIZATION_COMPLETED', {
        metadata: {
          originalSize,
          compressedSize,
          compressionRatio: compressionRatio.toFixed(2),
          processingTime,
          format: compressedFile.type
        }
      });

      return {
        originalSize,
        compressedSize,
        compressionRatio,
        optimizedData,
        format: compressedFile.type,
        processingTime
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      logger.error('IMAGE_OPTIMIZATION_FAILED', {
        metadata: { 
          error: error.message,
          processingTime 
        }
      });

      // Return original data if compression fails
      return {
        originalSize: typeof imageData === 'string' ? 
          this.base64ToBlob(imageData).size : 
          (imageData as Blob).size,
        compressedSize: 0,
        compressionRatio: 1,
        optimizedData: imageData,
        format: 'unknown',
        processingTime
      };
    }
  }

  // Optimize JSON response
  optimizeJSON(data: any): { optimized: string; originalSize: number; compressedSize: number } {
    const originalJSON = JSON.stringify(data);
    const originalSize = new Blob([originalJSON]).size;

    // Remove unnecessary whitespace and optimize structure
    const optimizedJSON = JSON.stringify(data, (key, value) => {
      // Remove null values
      if (value === null) return undefined;
      
      // Truncate very long strings in non-critical fields
      if (typeof value === 'string' && value.length > 10000 && 
          !key.includes('image') && !key.includes('data')) {
        return value.substring(0, 10000) + '...';
      }
      
      return value;
    });

    const compressedSize = new Blob([optimizedJSON]).size;

    logger.debug('JSON_OPTIMIZATION', {
      metadata: {
        originalSize,
        compressedSize,
        compressionRatio: (originalSize / compressedSize).toFixed(2)
      }
    });

    return {
      optimized: optimizedJSON,
      originalSize,
      compressedSize
    };
  }

  // Batch optimize multiple images
  async optimizeImageBatch(
    images: Array<{ id: string; data: string | Blob | File }>,
    options?: Partial<CompressionOptions>
  ): Promise<Array<{ id: string; result: OptimizationResult }>> {
    const results: Array<{ id: string; result: OptimizationResult }> = [];

    // Process in parallel with limited concurrency
    const concurrency = 4;
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      const promises = batch.map(async ({ id, data }) => ({
        id,
        result: await this.optimizeImage(data, options)
      }));

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    logger.info('BATCH_IMAGE_OPTIMIZATION_COMPLETED', {
      metadata: {
        totalImages: images.length,
        totalOriginalSize: results.reduce((sum, r) => sum + r.result.originalSize, 0),
        totalCompressedSize: results.reduce((sum, r) => sum + r.result.compressedSize, 0)
      }
    });

    return results;
  }

  // Adaptive quality based on image content
  async adaptiveOptimization(
    imageData: string | Blob | File,
    targetSizeKB: number = 500
  ): Promise<OptimizationResult> {
    let quality = 0.9;
    let result: OptimizationResult;

    do {
      result = await this.optimizeImage(imageData, { 
        ...this.defaultOptions, 
        quality 
      });
      
      quality -= 0.1;
    } while (result.compressedSize > targetSizeKB * 1024 && quality > 0.3);

    logger.info('ADAPTIVE_OPTIMIZATION_COMPLETED', {
      metadata: {
        finalQuality: quality + 0.1,
        targetSize: targetSizeKB * 1024,
        actualSize: result.compressedSize
      }
    });

    return result;
  }

  // Utility: Convert base64 to Blob
  private base64ToBlob(base64: string): Blob {
    const parts = base64.split(',');
    const contentType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const raw = atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  // Utility: Convert Blob to base64
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Check if optimization is beneficial
  shouldOptimize(dataSize: number, threshold: number = 100 * 1024): boolean {
    return dataSize > threshold; // Only optimize if larger than threshold (100KB default)
  }

  // Get optimization statistics
  getStats() {
    // This would typically be maintained across optimizations
    // For now, return current configuration
    return {
      defaultOptions: this.defaultOptions,
      supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
      maxConcurrency: 4
    };
  }
}

export const responseOptimizer = ResponseOptimizer.getInstance();