/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PKCEGenerator, OAuthStateGenerator, PKCEPair } from './pkce.js';

describe('PKCEGenerator', () => {
  describe('generate', () => {
    it('should generate a valid PKCE pair', () => {
      const pair = PKCEGenerator.generate();
      
      expect(pair).toHaveProperty('verifier');
      expect(pair).toHaveProperty('challenge');
      expect(pair).toHaveProperty('method');
      expect(pair.method).toBe('S256');
    });

    it('should generate verifier with correct length', () => {
      const pair = PKCEGenerator.generate();
      
      expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
      expect(pair.verifier.length).toBeLessThanOrEqual(128);
    });

    it('should generate challenge with correct format', () => {
      const pair = PKCEGenerator.generate();
      
      // Base64url format without padding
      expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(pair.challenge).not.toContain('=');
      expect(pair.challenge.length).toBe(43); // SHA-256 base64url is 43 chars
    });

    it('should generate different pairs each time', () => {
      const pair1 = PKCEGenerator.generate();
      const pair2 = PKCEGenerator.generate();
      
      expect(pair1.verifier).not.toBe(pair2.verifier);
      expect(pair1.challenge).not.toBe(pair2.challenge);
    });

    it('should generate pairs that pass validation', () => {
      const pair = PKCEGenerator.generate();
      
      expect(PKCEGenerator.validate(pair)).toBe(true);
    });
  });

  describe('validate', () => {
    it('should validate correct PKCE pairs', () => {
      const pair = PKCEGenerator.generate();
      
      expect(PKCEGenerator.validate(pair)).toBe(true);
    });

    it('should reject invalid PKCE pairs', () => {
      const invalidPair: PKCEPair = {
        verifier: 'invalid-verifier',
        challenge: 'invalid-challenge',
        method: 'S256'
      };
      
      expect(PKCEGenerator.validate(invalidPair)).toBe(false);
    });

    it('should reject tampered challenges', () => {
      const pair = PKCEGenerator.generate();
      const tamperedPair = {
        ...pair,
        challenge: pair.challenge + 'tampered'
      };
      
      expect(PKCEGenerator.validate(tamperedPair)).toBe(false);
    });
  });
});

describe('OAuthStateGenerator', () => {
  describe('generate', () => {
    it('should generate a hex string', () => {
      const state = OAuthStateGenerator.generate();
      
      expect(state).toMatch(/^[0-9a-f]+$/);
      expect(state.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate different values each time', () => {
      const state1 = OAuthStateGenerator.generate();
      const state2 = OAuthStateGenerator.generate();
      
      expect(state1).not.toBe(state2);
    });

    it('should generate cryptographically strong values', () => {
      const state = OAuthStateGenerator.generate();
      
      // Should be 32 bytes (256 bits) for cryptographic strength
      expect(state.length).toBe(64);
      expect(state).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});