#!/bin/bash

# Ouroboros Code Installation Script
# The Infinite Loop of AI Intelligence

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           OUROBOROS CODE - Installation Script                 ║"
echo "║         The Infinite Loop of AI Intelligence                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js v20 or later.${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}⚠️  Warning: Node.js version is less than 20. Recommended: v20 or later.${NC}"
fi

# Default installation directory
DEFAULT_INSTALL_DIR="/usr/local/bin"
INSTALL_DIR="${OUROBOROS_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

echo -e "${BLUE}📁 Installation directory: $INSTALL_DIR${NC}"

# Check if installation directory exists and is writable
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Creating installation directory: $INSTALL_DIR${NC}"
    sudo mkdir -p "$INSTALL_DIR"
elif [ ! -w "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Installation directory requires sudo access${NC}"
    NEEDS_SUDO=true
fi

# Copy the bundled executable
if [ -f "bundle/ouroboros-code.js" ]; then
    echo -e "${GREEN}📦 Installing Ouroboros Code...${NC}"
    
    if [ "$NEEDS_SUDO" = true ]; then
        sudo cp bundle/ouroboros-code.js "$INSTALL_DIR/ouroboros-code"
        sudo chmod +x "$INSTALL_DIR/ouroboros-code"
    else
        cp bundle/ouroboros-code.js "$INSTALL_DIR/ouroboros-code"
        chmod +x "$INSTALL_DIR/ouroboros-code"
    fi
    
    # Copy sandbox files if on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${BLUE}🔒 Installing macOS sandbox profiles...${NC}"
        SANDBOX_DIR="$HOME/.ouroboros/sandbox"
        mkdir -p "$SANDBOX_DIR"
        cp bundle/sandbox-*.sb "$SANDBOX_DIR/" 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✅ Installation complete!${NC}"
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    🎉 Installation Successful! 🎉               ║"
    echo "╠════════════════════════════════════════════════════════════════╣"
    echo "║  Ouroboros Code has been installed to: $INSTALL_DIR            ║"
    echo "║                                                                ║"
    echo "║  To get started, run:                                         ║"
    echo "║    ouroboros-code --help                                      ║"
    echo "║                                                                ║"
    echo "║  Interactive mode:                                            ║"
    echo "║    ouroboros-code                                             ║"
    echo "║                                                                ║"
    echo "║  Non-interactive mode:                                        ║"
    echo "║    ouroboros-code -p \"your prompt here\"                       ║"
    echo "║                                                                ║"
    echo "║  Initialize a project:                                        ║"
    echo "║    ouroboros-code --prompt \"/init\"                            ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    
    # Test the installation
    echo ""
    echo -e "${BLUE}Testing installation...${NC}"
    if command -v ouroboros-code &> /dev/null; then
        echo -e "${GREEN}✅ ouroboros-code command is available${NC}"
    else
        echo -e "${YELLOW}⚠️  Note: You may need to add $INSTALL_DIR to your PATH${NC}"
        echo -e "${YELLOW}   Add this to your shell profile (.bashrc, .zshrc, etc.):${NC}"
        echo -e "${YELLOW}   export PATH=\"$INSTALL_DIR:\$PATH\"${NC}"
    fi
else
    echo -e "${RED}❌ Error: bundle/ouroboros-code.js not found${NC}"
    echo -e "${YELLOW}Please run 'npm run bundle' first${NC}"
    exit 1
fi