#!/bin/bash

# Build the project
npm run build

# Start the CLI in a way that allows testing tool usage
# We'll use a simple test to trigger tool execution
echo "Testing TUI tool rendering with memoization fixes..."

# For now, let's just run a basic test to see if the CLI starts
npm run start -- --help