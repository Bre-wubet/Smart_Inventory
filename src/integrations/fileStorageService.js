/**
 * File Storage Integration Service
 * 
 * Comprehensive file storage service for document management, file uploads, and cloud storage
 * Supports multiple storage providers with unified interface
 */

const { logger } = require('../config/logger');
const { ValidationError } = require('../core/exceptions');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FileStorageService {
  constructor() {
    this.storageProviders = new Map();
    this.fileTypes = new Map();
    this.initializeProviders();
    this.initializeFileTypes();
  }

  /**
   * Initialize storage providers
   */
  initializeProviders() {
    // AWS S3 provider
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.storageProviders.set('aws-s3', {
        name: 'AWS S3',
        upload: async (fileData, options) => {
          const AWS = require('aws-sdk');
          const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1'
          });

          const params = {
            Bucket: process.env.AWS_S3_BUCKET || 'smart-inventory-files',
            Key: options.key,
            Body: fileData,
            ContentType: options.contentType,
            ACL: options.acl || 'private',
            Metadata: options.metadata || {}
          };

          const result = await s3.upload(params).promise();
          return {
            success: true,
            url: result.Location,
            key: result.Key,
            etag: result.ETag
          };
        },
        download: async (key) => {
          const AWS = require('aws-sdk');
          const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1'
          });

          const params = {
            Bucket: process.env.AWS_S3_BUCKET || 'smart-inventory-files',
            Key: key
          };

          const result = await s3.getObject(params).promise();
          return result.Body;
        },
        delete: async (key) => {
          const AWS = require('aws-sdk');
          const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1'
          });

          const params = {
            Bucket: process.env.AWS_S3_BUCKET || 'smart-inventory-files',
            Key: key
          };

          await s3.deleteObject(params).promise();
          return { success: true };
        }
      });
    }

    // Google Cloud Storage provider
    if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
      this.storageProviders.set('gcs', {
        name: 'Google Cloud Storage',
        upload: async (fileData, options) => {
          const { Storage } = require('@google-cloud/storage');
          const storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
            keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
          });

          const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'smart-inventory-files');
          const file = bucket.file(options.key);

          await file.save(fileData, {
            metadata: {
              contentType: options.contentType,
              metadata: options.metadata || {}
            }
          });

          return {
            success: true,
            url: `https://storage.googleapis.com/${bucket.name}/${options.key}`,
            key: options.key
          };
        },
        download: async (key) => {
          const { Storage } = require('@google-cloud/storage');
          const storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
            keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
          });

          const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'smart-inventory-files');
          const file = bucket.file(key);

          const [data] = await file.download();
          return data;
        },
        delete: async (key) => {
          const { Storage } = require('@google-cloud/storage');
          const storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
            keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
          });

          const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'smart-inventory-files');
          const file = bucket.file(key);

          await file.delete();
          return { success: true };
        }
      });
    }

    // Azure Blob Storage provider
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      this.storageProviders.set('azure-blob', {
        name: 'Azure Blob Storage',
        upload: async (fileData, options) => {
          const { BlobServiceClient } = require('@azure/storage-blob');
          const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
          );

          const containerClient = blobServiceClient.getContainerClient(
            process.env.AZURE_CONTAINER_NAME || 'smart-inventory-files'
          );
          const blockBlobClient = containerClient.getBlockBlobClient(options.key);

          await blockBlobClient.upload(fileData, fileData.length, {
            blobHTTPHeaders: {
              blobContentType: options.contentType
            },
            metadata: options.metadata || {}
          });

          return {
            success: true,
            url: blockBlobClient.url,
            key: options.key
          };
        },
        download: async (key) => {
          const { BlobServiceClient } = require('@azure/storage-blob');
          const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
          );

          const containerClient = blobServiceClient.getContainerClient(
            process.env.AZURE_CONTAINER_NAME || 'smart-inventory-files'
          );
          const blockBlobClient = containerClient.getBlockBlobClient(key);

          const downloadResponse = await blockBlobClient.download();
          return downloadResponse.readableStreamBody;
        },
        delete: async (key) => {
          const { BlobServiceClient } = require('@azure/storage-blob');
          const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
          );

          const containerClient = blobServiceClient.getContainerClient(
            process.env.AZURE_CONTAINER_NAME || 'smart-inventory-files'
          );
          const blockBlobClient = containerClient.getBlockBlobClient(key);

          await blockBlobClient.delete();
          return { success: true };
        }
      });
    }

    // Local file system provider
    this.storageProviders.set('local', {
      name: 'Local File System',
      upload: async (fileData, options) => {
        const uploadDir = process.env.LOCAL_UPLOAD_DIR || './uploads';
        const filePath = path.join(uploadDir, options.key);
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        await fs.writeFile(filePath, fileData);
        
        return {
          success: true,
          url: `/uploads/${options.key}`,
          key: options.key,
          path: filePath
        };
      },
      download: async (key) => {
        const uploadDir = process.env.LOCAL_UPLOAD_DIR || './uploads';
        const filePath = path.join(uploadDir, key);
        
        return await fs.readFile(filePath);
      },
      delete: async (key) => {
        const uploadDir = process.env.LOCAL_UPLOAD_DIR || './uploads';
        const filePath = path.join(uploadDir, key);
        
        await fs.unlink(filePath);
        return { success: true };
      }
    });
  }

  /**
   * Initialize file type configurations
   */
  initializeFileTypes() {
    this.fileTypes.set('image', {
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
      maxSize: 10 * 1024 * 1024, // 10MB
      mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    });

    this.fileTypes.set('document', {
      allowedExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
      maxSize: 50 * 1024 * 1024, // 50MB
      mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    });

    this.fileTypes.set('spreadsheet', {
      allowedExtensions: ['.csv', '.xls', '.xlsx'],
      maxSize: 20 * 1024 * 1024, // 20MB
      mimeTypes: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    });

    this.fileTypes.set('archive', {
      allowedExtensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
      maxSize: 100 * 1024 * 1024, // 100MB
      mimeTypes: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed']
    });
  }

  /**
   * Upload file
   */
  async uploadFile({
    fileData,
    fileName,
    fileType = 'document',
    tenantId,
    category = 'general',
    metadata = {},
    provider = 'local'
  }) {
    try {
      if (!fileData || !fileName) {
        throw new ValidationError('File data and file name are required');
      }

      if (!this.storageProviders.has(provider)) {
        throw new ValidationError(`Storage provider '${provider}' is not configured`);
      }

      // Validate file type
      const typeConfig = this.fileTypes.get(fileType);
      if (typeConfig) {
        const fileExtension = path.extname(fileName).toLowerCase();
        if (!typeConfig.allowedExtensions.includes(fileExtension)) {
          throw new ValidationError(`File type not allowed. Allowed extensions: ${typeConfig.allowedExtensions.join(', ')}`);
        }

        if (fileData.length > typeConfig.maxSize) {
          throw new ValidationError(`File size exceeds maximum allowed size of ${typeConfig.maxSize / (1024 * 1024)}MB`);
        }
      }

      // Generate unique file key
      const fileKey = this.generateFileKey(tenantId, category, fileName);
      
      // Get content type
      const contentType = this.getContentType(fileName);

      const uploadOptions = {
        key: fileKey,
        contentType,
        metadata: {
          ...metadata,
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
          tenantId,
          category,
          fileType
        }
      };

      const storageProvider = this.storageProviders.get(provider);
      const result = await storageProvider.upload(fileData, uploadOptions);

      logger.info({
        fileName,
        fileKey,
        provider,
        tenantId,
        category,
        size: fileData.length
      }, 'File uploaded successfully');

      return {
        success: true,
        fileId: this.generateFileId(fileKey),
        fileName,
        fileKey,
        url: result.url,
        size: fileData.length,
        contentType,
        provider,
        uploadedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error({
        error: error.message,
        fileName,
        provider,
        tenantId
      }, 'File upload failed');
      throw error;
    }
  }

  /**
   * Download file
   */
  async downloadFile(fileKey, provider = 'local') {
    try {
      if (!this.storageProviders.has(provider)) {
        throw new ValidationError(`Storage provider '${provider}' is not configured`);
      }

      const storageProvider = this.storageProviders.get(provider);
      const fileData = await storageProvider.download(fileKey);

      logger.info({
        fileKey,
        provider
      }, 'File downloaded successfully');

      return fileData;

    } catch (error) {
      logger.error({
        error: error.message,
        fileKey,
        provider
      }, 'File download failed');
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileKey, provider = 'local') {
    try {
      if (!this.storageProviders.has(provider)) {
        throw new ValidationError(`Storage provider '${provider}' is not configured`);
      }

      const storageProvider = this.storageProviders.get(provider);
      await storageProvider.delete(fileKey);

      logger.info({
        fileKey,
        provider
      }, 'File deleted successfully');

      return { success: true };

    } catch (error) {
      logger.error({
        error: error.message,
        fileKey,
        provider
      }, 'File deletion failed');
      throw error;
    }
  }

  /**
   * Generate file key
   */
  generateFileKey(tenantId, category, fileName) {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    
    return `${tenantId}/${category}/${timestamp}-${randomString}-${baseName}${extension}`;
  }

  /**
   * Generate file ID
   */
  generateFileId(fileKey) {
    return crypto.createHash('md5').update(fileKey).digest('hex');
  }

  /**
   * Get content type from file name
   */
  getContentType(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.csv': 'text/csv',
      '.txt': 'text/plain',
      '.zip': 'application/zip',
      '.json': 'application/json'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Validate file
   */
  validateFile(fileData, fileName, fileType) {
    const typeConfig = this.fileTypes.get(fileType);
    if (!typeConfig) {
      return { valid: true }; // No restrictions
    }

    const fileExtension = path.extname(fileName).toLowerCase();
    const isValidExtension = typeConfig.allowedExtensions.includes(fileExtension);
    const isValidSize = fileData.length <= typeConfig.maxSize;

    return {
      valid: isValidExtension && isValidSize,
      errors: [
        ...(isValidExtension ? [] : [`Invalid file extension. Allowed: ${typeConfig.allowedExtensions.join(', ')}`]),
        ...(isValidSize ? [] : [`File too large. Max size: ${typeConfig.maxSize / (1024 * 1024)}MB`])
      ]
    };
  }

  /**
   * Get file information
   */
  async getFileInfo(fileKey, provider = 'local') {
    try {
      // This would typically involve querying the storage provider for metadata
      // For now, return basic information
      return {
        fileKey,
        provider,
        exists: true,
        lastModified: new Date().toISOString()
      };
    } catch (error) {
      logger.error({
        error: error.message,
        fileKey,
        provider
      }, 'Failed to get file information');
      throw error;
    }
  }

  /**
   * List files
   */
  async listFiles(tenantId, category = null, provider = 'local') {
    try {
      // This would typically involve listing files from the storage provider
      // For now, return empty list
      return [];
    } catch (error) {
      logger.error({
        error: error.message,
        tenantId,
        category,
        provider
      }, 'Failed to list files');
      throw error;
    }
  }

  /**
   * Test storage provider configuration
   */
  async testProvider(provider) {
    try {
      if (!this.storageProviders.has(provider)) {
        throw new ValidationError(`Storage provider '${provider}' is not configured`);
      }

      const testData = Buffer.from('test file content');
      const testKey = `test-${Date.now()}.txt`;

      // Test upload
      const uploadResult = await this.uploadFile({
        fileData: testData,
        fileName: testKey,
        tenantId: 'test',
        category: 'test'
      });

      // Test download
      await this.downloadFile(uploadResult.fileKey, provider);

      // Test delete
      await this.deleteFile(uploadResult.fileKey, provider);

      return {
        status: 'success',
        message: 'Storage provider configuration is valid'
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * Get available storage providers
   */
  getAvailableProviders() {
    return Array.from(this.storageProviders.keys());
  }

  /**
   * Get file type configurations
   */
  getFileTypeConfigs() {
    return Object.fromEntries(this.fileTypes);
  }

  /**
   * Get storage statistics
   */
  async getStatistics() {
    return {
      availableProviders: this.getAvailableProviders(),
      fileTypes: Object.keys(this.getFileTypeConfigs()),
      status: 'active'
    };
  }
}

// Create singleton instance
const fileStorageService = new FileStorageService();

module.exports = {
  fileStorageService,
  FileStorageService
};
