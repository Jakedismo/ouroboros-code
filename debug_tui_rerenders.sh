#!/bin/bash

echo "Debugging TUI re-rendering issue..."
echo "This script will run the CLI with debug logging to see component re-renders"
echo ""

# Build the project
npm run build

# Run CLI with a command that triggers tool execution
echo "Running CLI with tool execution to observe re-renders..."
echo "Command: /run-command echo 'test tool execution'"
echo ""

# Note: You'll need to set your API key
# export GEMINI_API_KEY=your_key_here
# Or for OpenAI:
# export OPENAI_API_KEY=your_key_here

echo "To test with OpenAI (where bug occurs):"
echo "npm run start -- --provider openai"
echo "Then type: /run-command echo 'test'"
echo ""
echo "To test with Gemini (where bug doesn't occur):"
echo "npm run start -- --provider gemini"
echo "Then type: /run-command echo 'test'"
echo ""
echo "Look for console logs showing component re-renders during tool execution."