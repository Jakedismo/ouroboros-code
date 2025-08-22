/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  clipboardHasImage,
  getClipboardImage,
  loadImageFromPath,
  extractImagePaths,
  removeImagePaths,
  cleanupOldClipboardImages,
  ClipboardImage,
} from '../../utils/clipboardUtils.js';
import { ImagePart } from '@ouroboros/code-cli-core';

export interface AttachedImage extends ClipboardImage {
  id: string;
  displayName: string;
}

export interface UseImagePasteOptions {
  onImagesChanged?: (images: AttachedImage[]) => void;
  maxImages?: number;
  autoCleanup?: boolean;
}

export interface UseImagePasteReturn {
  attachedImages: AttachedImage[];
  checkAndAttachClipboardImage: () => Promise<boolean>;
  attachImagesFromText: (text: string) => Promise<{ cleanedText: string; imagesAdded: number }>;
  removeImage: (id: string) => void;
  clearImages: () => void;
  createImageParts: () => ImagePart[];
  hasImages: boolean;
  totalSize: number;
}

/**
 * Hook to manage image pasting and attachment from clipboard and file paths
 */
export function useImagePaste(options: UseImagePasteOptions = {}): UseImagePasteReturn {
  const { onImagesChanged, maxImages = 10, autoCleanup = true } = options;
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const imageIdCounter = useRef(0);
  
  // Auto cleanup old clipboard images on mount
  useEffect(() => {
    if (autoCleanup) {
      cleanupOldClipboardImages().catch(console.debug);
    }
  }, [autoCleanup]);
  
  // Notify when images change
  useEffect(() => {
    onImagesChanged?.(attachedImages);
  }, [attachedImages, onImagesChanged]);
  
  /**
   * Check clipboard and attach image if found
   */
  const checkAndAttachClipboardImage = useCallback(async (): Promise<boolean> => {
    try {
      // Check if we've reached max images
      if (attachedImages.length >= maxImages) {
        console.debug(`Maximum number of images (${maxImages}) already attached`);
        return false;
      }
      
      // Check if clipboard has image
      if (!(await clipboardHasImage())) {
        return false;
      }
      
      // Get image from clipboard
      const image = await getClipboardImage();
      if (!image) {
        return false;
      }
      
      // Create attached image with metadata
      const attachedImage: AttachedImage = {
        ...image,
        id: `clipboard-${++imageIdCounter.current}`,
        displayName: `Clipboard Image ${imageIdCounter.current}`,
      };
      
      // Add to attached images
      setAttachedImages(prev => [...prev, attachedImage]);
      
      return true;
    } catch (error) {
      console.debug('Failed to attach clipboard image:', error);
      return false;
    }
  }, [attachedImages.length, maxImages]);
  
  /**
   * Extract and attach images from text containing file paths
   */
  const attachImagesFromText = useCallback(async (
    text: string
  ): Promise<{ cleanedText: string; imagesAdded: number }> => {
    try {
      // Extract image paths from text
      const imagePaths = extractImagePaths(text);
      if (imagePaths.length === 0) {
        return { cleanedText: text, imagesAdded: 0 };
      }
      
      // Remove image paths from text
      const cleanedText = removeImagePaths(text);
      
      // Load images from paths
      const newImages: AttachedImage[] = [];
      for (const imagePath of imagePaths) {
        // Check if we've reached max images
        if (attachedImages.length + newImages.length >= maxImages) {
          console.debug(`Maximum number of images (${maxImages}) reached`);
          break;
        }
        
        const image = await loadImageFromPath(imagePath);
        if (image) {
          const attachedImage: AttachedImage = {
            ...image,
            id: `file-${++imageIdCounter.current}`,
            displayName: image.fileName || `Image ${imageIdCounter.current}`,
          };
          newImages.push(attachedImage);
        }
      }
      
      // Add new images to attached images
      if (newImages.length > 0) {
        setAttachedImages(prev => [...prev, ...newImages]);
      }
      
      return { cleanedText, imagesAdded: newImages.length };
    } catch (error) {
      console.debug('Failed to attach images from text:', error);
      return { cleanedText: text, imagesAdded: 0 };
    }
  }, [attachedImages.length, maxImages]);
  
  /**
   * Remove an attached image by ID
   */
  const removeImage = useCallback((id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  }, []);
  
  /**
   * Clear all attached images
   */
  const clearImages = useCallback(() => {
    setAttachedImages([]);
  }, []);
  
  /**
   * Create ImagePart array for provider message
   */
  const createImageParts = useCallback((): ImagePart[] => {
    return attachedImages.map(image => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    }));
  }, [attachedImages]);
  
  /**
   * Calculate total size of attached images
   */
  const totalSize = attachedImages.reduce((sum, img) => sum + img.size, 0);
  
  return {
    attachedImages,
    checkAndAttachClipboardImage,
    attachImagesFromText,
    removeImage,
    clearImages,
    createImageParts,
    hasImages: attachedImages.length > 0,
    totalSize,
  };
}