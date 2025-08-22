/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export interface ClipboardImage {
  mimeType: string;
  data: string; // base64
  size: number;
  source: 'clipboard' | 'file';
  fileName?: string;
}

/**
 * Maximum image size in bytes (20MB for most providers)
 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/**
 * Supported image formats
 */
const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/**
 * Check if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  const platform = process.platform;
  
  try {
    if (platform === 'darwin') {
      // macOS: Use pbpaste to check clipboard type
      const { stdout } = await execAsync(
        'pbpaste -info 2>/dev/null | grep -c "image" || true'
      );
      return parseInt(stdout.trim()) > 0;
    } else if (platform === 'win32') {
      // Windows: Use PowerShell to check clipboard
      const { stdout } = await execAsync(
        'powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()"'
      );
      return stdout.trim().toLowerCase() === 'true';
    } else {
      // Linux: Use xclip to check clipboard targets
      try {
        const { stdout } = await execAsync(
          'xclip -selection clipboard -t TARGETS -o 2>/dev/null'
        );
        return stdout.includes('image/');
      } catch {
        // Fallback to wl-paste for Wayland
        try {
          const { stdout } = await execAsync('wl-paste --list-types 2>/dev/null');
          return stdout.includes('image/');
        } catch {
          return false;
        }
      }
    }
  } catch (error) {
    console.debug('Failed to check clipboard for image:', error);
    return false;
  }
}

/**
 * Get image from clipboard
 */
export async function getClipboardImage(): Promise<ClipboardImage | null> {
  const platform = process.platform;
  
  try {
    let base64Data: string;
    let mimeType: string = 'image/png';
    
    if (platform === 'darwin') {
      // macOS: Use osascript to save clipboard image
      const tempFile = path.join(os.tmpdir(), `clipboard-${Date.now()}.png`);
      
      // Check if clipboard has image data
      const hasImage = await clipboardHasImage();
      if (!hasImage) return null;
      
      // Save clipboard image to temp file using osascript
      const script = `
        set tempFile to POSIX file "${tempFile}"
        try
          set imageData to the clipboard as «class PNGf»
          set fileRef to open for access tempFile with write permission
          write imageData to fileRef
          close access fileRef
          return "success"
        on error
          try
            close access tempFile
          end try
          return "error"
        end try
      `;
      
      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      if (stdout.trim() !== 'success') {
        return null;
      }
      
      // Read the saved file
      const buffer = await fs.readFile(tempFile);
      base64Data = buffer.toString('base64');
      
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});
      
    } else if (platform === 'win32') {
      // Windows: PowerShell clipboard to base64
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $img = [System.Windows.Forms.Clipboard]::GetImage()
        if ($img) {
          $ms = New-Object System.IO.MemoryStream
          $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
          [Convert]::ToBase64String($ms.ToArray())
          $ms.Dispose()
          $img.Dispose()
        }
      `;
      const { stdout } = await execAsync(`powershell -command "${script}"`);
      base64Data = stdout.trim();
      
    } else {
      // Linux: Try xclip first, then wl-paste for Wayland
      try {
        const { stdout } = await execAsync(
          'xclip -selection clipboard -t image/png -o 2>/dev/null | base64 -w 0'
        );
        base64Data = stdout.trim();
      } catch {
        // Fallback to wl-paste for Wayland
        const { stdout } = await execAsync(
          'wl-paste -t image/png 2>/dev/null | base64 -w 0'
        );
        base64Data = stdout.trim();
      }
    }
    
    if (!base64Data) return null;
    
    // Validate size
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > MAX_IMAGE_SIZE) {
      console.warn(`Image size ${buffer.length} exceeds maximum ${MAX_IMAGE_SIZE}`);
      return null;
    }
    
    return {
      mimeType,
      data: base64Data,
      size: buffer.length,
      source: 'clipboard',
    };
  } catch (error) {
    console.debug('Failed to get clipboard image:', error);
    return null;
  }
}

/**
 * Load image from file path
 */
export async function loadImageFromPath(filePath: string): Promise<ClipboardImage | null> {
  try {
    // Resolve path relative to current working directory
    const resolvedPath = path.resolve(filePath);
    
    // Check if file exists
    if (!existsSync(resolvedPath)) {
      console.debug(`Image file not found: ${resolvedPath}`);
      return null;
    }
    
    // Check file extension
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!SUPPORTED_FORMATS.includes(ext)) {
      console.debug(`Unsupported image format: ${ext}`);
      return null;
    }
    
    // Read file
    const buffer = await fs.readFile(resolvedPath);
    
    // Check size
    if (buffer.length > MAX_IMAGE_SIZE) {
      console.warn(`Image size ${buffer.length} exceeds maximum ${MAX_IMAGE_SIZE}`);
      return null;
    }
    
    // Determine MIME type
    let mimeType = 'image/png';
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
      case '.png':
      default:
        mimeType = 'image/png';
    }
    
    return {
      mimeType,
      data: buffer.toString('base64'),
      size: buffer.length,
      source: 'file',
      fileName: path.basename(resolvedPath),
    };
  } catch (error) {
    console.debug(`Failed to load image from path ${filePath}:`, error);
    return null;
  }
}

/**
 * Extract image paths from text (e.g., @/path/to/image.png)
 */
export function extractImagePaths(text: string): string[] {
  const pathPattern = /@([^\s]+\.(png|jpg|jpeg|gif|webp))/gi;
  const matches = Array.from(text.matchAll(pathPattern));
  return matches.map(match => match[1]);
}

/**
 * Remove image path references from text
 */
export function removeImagePaths(text: string): string {
  const pathPattern = /@([^\s]+\.(png|jpg|jpeg|gif|webp))/gi;
  return text.replace(pathPattern, '').trim();
}

/**
 * Clean up old clipboard images from temp directory
 */
export async function cleanupOldClipboardImages(): Promise<void> {
  try {
    const tempDir = os.tmpdir();
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const file of files) {
      if (file.startsWith('clipboard-') && file.endsWith('.png')) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.debug('Failed to cleanup old clipboard images:', error);
  }
}

/**
 * Save clipboard image to temp file (for debugging or caching)
 */
export async function saveClipboardImage(image: ClipboardImage): Promise<string | null> {
  try {
    const tempDir = os.tmpdir();
    const fileName = `clipboard-${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);
    
    const buffer = Buffer.from(image.data, 'base64');
    await fs.writeFile(filePath, buffer);
    
    return filePath;
  } catch (error) {
    console.debug('Failed to save clipboard image:', error);
    return null;
  }
}