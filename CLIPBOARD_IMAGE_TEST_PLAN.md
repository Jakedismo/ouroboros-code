# Clipboard Image Input Test Plan

## Overview
This test plan verifies the clipboard image input functionality across different platforms (macOS, Windows, Linux).

## Features to Test

### 1. Clipboard Image Pasting
- **Test**: Copy an image to clipboard (from browser, screenshot tool, or image editor)
- **Action**: Press Ctrl+V (or Cmd+V on macOS) in the terminal
- **Expected**: Image indicator shows "📎 1 image attached" with file size

### 2. Multiple Image Support
- **Test**: Paste multiple images in sequence
- **Action**: Copy and paste different images multiple times
- **Expected**: Counter increases "📎 2 images attached", all images listed

### 3. File Path Support
- **Test**: Type @/path/to/image.png in the prompt
- **Action**: Submit message with image path references
- **Expected**: Images are extracted from paths and attached automatically

### 4. Mixed Text and Images
- **Test**: Combine text prompt with images
- **Action**: Type "Analyze this image" then paste an image
- **Expected**: Both text and image are sent to the LLM provider

### 5. Image Cleanup
- **Test**: Submit prompt with images
- **Action**: Press Enter to send
- **Expected**: Images are cleared after submission

## Platform-Specific Testing

### macOS
```bash
# Test screenshot clipboard
# 1. Press Cmd+Shift+4, select area
# 2. Press Ctrl+Cmd+Shift+4 to copy to clipboard
# 3. In ouroboros-code, press Cmd+V
```

### Windows
```bash
# Test screenshot clipboard
# 1. Press Win+Shift+S, select area (copies to clipboard)
# 2. In ouroboros-code, press Ctrl+V
```

### Linux
```bash
# Test with xclip
# 1. Take screenshot: gnome-screenshot -a -c
# 2. In ouroboros-code, press Ctrl+V

# Test with wl-copy (Wayland)
# 1. Take screenshot: grim -g "$(slurp)" - | wl-copy
# 2. In ouroboros-code, press Ctrl+V
```

## Edge Cases

### 1. Maximum Images
- Test pasting more than 10 images
- Expected: Only first 10 are accepted

### 2. Large Images
- Test with images > 5MB
- Expected: Large images are rejected with message

### 3. Invalid Paths
- Test with @/nonexistent/image.png
- Expected: Invalid paths are ignored, text remains

### 4. Non-Image Clipboard
- Test pasting when clipboard has text
- Expected: No image attachment occurs

## Usage Examples

### Example 1: Analyzing a Screenshot
```bash
ouroboros-code
> What's in this screenshot? [Cmd+V to paste image]
📎 1 image attached (245KB)
  - Clipboard Image 1
> [Press Enter to send]
```

### Example 2: Multiple Images with Paths
```bash
ouroboros-code  
> Compare these designs @/Users/me/design1.png @/Users/me/design2.png
📎 2 images attached (512KB)
  - design1.png
  - design2.png
> [Press Enter to send]
```

### Example 3: Code Review with Screenshot
```bash
ouroboros-code
> This code has a bug [Paste screenshot of error]
📎 1 image attached (128KB)
  - Clipboard Image 1
> Can you help me fix it?
> [Press Enter to send]
```

## Troubleshooting

### Image Not Pasting
1. Ensure image is in clipboard (test in another app)
2. Check terminal supports bracketed paste mode
3. Try alternative: use file path @/path/to/image.png

### Platform-Specific Issues
- **macOS**: Requires `pbpaste` command
- **Windows**: Requires PowerShell
- **Linux**: Requires `xclip` or `wl-paste`

## Success Criteria
✅ Images can be pasted from clipboard
✅ Multiple images are supported
✅ File paths are recognized and loaded
✅ Visual indicators show attached images
✅ Images are sent with text to LLM providers
✅ Works on macOS, Windows, and Linux