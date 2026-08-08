import { Injectable } from '@angular/core';

/**
 * CryptoService — handles all client-side cryptographic operations.
 *
 * Uses exclusively the Web Crypto API (window.crypto.subtle).
 * No external cryptography libraries.
 *
 * Encrypted payload format:
 * ┌────────────┬───────────────────────────────┐
 * │ IV 12 bytes│ AES-GCM ciphertext + auth tag │
 * └────────────┴───────────────────────────────┘
 */
@Injectable({
  providedIn: 'root',
})
export class CryptoService {
  /** IV length in bytes (96-bit nonce recommended for AES-GCM) */
  private readonly IV_LENGTH = 12;

  /**
   * Checks whether the browser supports the Web Crypto API.
   */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.crypto !== 'undefined' &&
      typeof window.crypto.subtle !== 'undefined'
    );
  }

  /**
   * Generates a new AES-GCM 256-bit CryptoKey.
   * The key is extractable so it can later be exported for the share URL.
   */
  async generateKey(): Promise<CryptoKey> {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API no está disponible en este navegador.');
    }

    return window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Encrypts a file buffer using AES-GCM with a random IV.
   * Returns the combined payload as ArrayBuffer: [ IV (12 bytes) | ciphertext + auth tag ].
   *
   * The IV is never reused — it is freshly generated per invocation.
   */
  async encryptFile(fileBuffer: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
    // Cryptographically secure random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      fileBuffer,
    );

    // Combine: [IV][ciphertext + auth tag] into a single ArrayBuffer
    const ciphertextBytes = new Uint8Array(ciphertext);
    const combined = new Uint8Array(iv.byteLength + ciphertextBytes.byteLength);
    combined.set(iv, 0);
    combined.set(ciphertextBytes, iv.byteLength);

    return combined.buffer as ArrayBuffer;
  }

  /**
   * Exports a CryptoKey to a Base64URL-encoded string (URL-safe, no padding).
   *
   * This string is meant to be placed exclusively in the URL fragment (#).
   * It must NEVER be sent to any server.
   */
  async exportKeyToBase64Url(key: CryptoKey): Promise<string> {
    const rawBuffer = await window.crypto.subtle.exportKey('raw', key);
    const bytes = new Uint8Array(rawBuffer);
    return this.arrayBufferToBase64Url(bytes);
  }

  /**
   * Converts a Uint8Array to a Base64URL string (RFC 4648 §5).
   * Replaces + → -, / → _, strips trailing =.
   */
  private arrayBufferToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
