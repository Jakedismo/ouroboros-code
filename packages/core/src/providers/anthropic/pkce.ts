/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';

/**
 * PKCE (Proof Key for Code Exchange) pair for OAuth 2.0
 * Implements RFC 7636 for enhanced security in public clients
 */
export interface PKCEPair {
  /** The code verifier - a high-entropy cryptographic random string */
  verifier: string;
  /** The code challenge - derived from the verifier */
  challenge: string;
  /** The challenge method - always S256 for security */
  method: 'S256';
}

/**
 * Generates PKCE parameters for OAuth 2.0 authorization code flow
 * Following RFC 7636 recommendations for code verifier and challenge
 */
export class PKCEGenerator {
  /**
   * Generate a PKCE verifier and challenge pair
   * 
   * @returns A PKCE pair with verifier, challenge, and method
   */
  static generate(): PKCEPair {
    // Generate a high-entropy random string for the verifier
    // RFC 7636 recommends 43-128 characters, we use 128 for maximum security
    const verifier = this.generateVerifier();
    
    // Create SHA-256 challenge from the verifier
    const challenge = this.generateChallenge(verifier);
    
    return {
      verifier,
      challenge,
      method: 'S256'
    };
  }

  /**
   * Generate a code verifier
   * Must be 43-128 characters from [A-Z] [a-z] [0-9] - . _ ~
   * 
   * @returns A base64url encoded random string
   */
  private static generateVerifier(): string {
    // Generate 96 random bytes (will produce 128 characters in base64url)
    const buffer = crypto.randomBytes(96);
    
    // Convert to base64url format (URL-safe without padding)
    return buffer
      .toString('base64url')
      .replace(/=/g, '')
      .substring(0, 128);
  }

  /**
   * Generate a code challenge from the verifier
   * Uses SHA-256 hash encoded as base64url
   * 
   * @param verifier - The code verifier string
   * @returns The base64url encoded SHA-256 hash
   */
  private static generateChallenge(verifier: string): string {
    return crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')
      .replace(/=/g, '');
  }

  /**
   * Validate a PKCE pair (useful for testing)
   * 
   * @param pair - The PKCE pair to validate
   * @returns True if the challenge matches the verifier
   */
  static validate(pair: PKCEPair): boolean {
    const expectedChallenge = this.generateChallenge(pair.verifier);
    return expectedChallenge === pair.challenge;
  }
}

/**
 * Utility class for OAuth state parameter generation
 */
export class OAuthStateGenerator {
  /**
   * Generate a cryptographically secure state parameter
   * Used to prevent CSRF attacks in OAuth flows
   * 
   * @returns A hex-encoded random string
   */
  static generate(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}