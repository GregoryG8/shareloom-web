import { Injectable } from '@angular/core';

/**
 * CryptoService — handles all client-side cryptographic operations.
 *
 * Uses exclusively the Web Crypto API (window.crypto.subtle).
 * No external cryptography libraries.
 *
 * Upload: encrypts file → returns ciphertext (without IV prepended).
 * Download: imports key from Base64URL, decrypts ciphertext using provided IV.
 *
 * URL fragment format: #fileId:key:iv
 * The IV travels in the URL fragment (never sent to server via HTTP).
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
   * Generates a cryptographically secure random IV (12 bytes).
   */
  generateIv(): Uint8Array<ArrayBuffer> {
    return window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  }

  /**
   * Encrypts a file buffer using AES-GCM with the provided IV.
   * Returns ONLY the ciphertext + auth tag (IV is NOT prepended).
   * The IV must be stored separately (in the URL fragment).
   */
  async encryptFile(fileBuffer: ArrayBuffer, key: CryptoKey, iv: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      fileBuffer,
    );

    return ciphertext;
  }

  /**
   * Decrypts an AES-GCM encrypted buffer using the provided key and IV.
   *
   * @param encryptedData - The ciphertext + auth tag (no IV prefix)
   * @param key - The AES-GCM CryptoKey
   * @param iv - The 12-byte IV used during encryption
   * @returns The decrypted plaintext as ArrayBuffer
   */
  async decryptFile(encryptedData: ArrayBuffer, key: CryptoKey, iv: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API no está disponible en este navegador.');
    }

    try {
      return await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData,
      );
    } catch {
      throw new Error(
        'No se pudo descifrar el archivo. La clave o el IV pueden ser incorrectos, o el archivo fue modificado.',
      );
    }
  }

  /**
   * Imports a CryptoKey from a Base64URL-encoded string.
   * Used when reading the key from the URL fragment during download.
   */
  async importKeyFromBase64Url(base64UrlKey: string): Promise<CryptoKey> {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API no está disponible en este navegador.');
    }

    const rawBytes = this.base64UrlToUint8Array(base64UrlKey);

    if (rawBytes.byteLength !== 32) {
      throw new Error('La clave proporcionada no es válida (debe ser de 256 bits).');
    }

    return window.crypto.subtle.importKey(
      'raw',
      rawBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
  }

  /**
   * Converts a Base64URL string back to a Uint8Array.
   * Used to restore IV and key from the URL fragment.
   */
  base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
    // Restore standard Base64: - → +, _ → /, re-add padding
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding === 2) base64 += '==';
    else if (padding === 3) base64 += '=';

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes as Uint8Array<ArrayBuffer>;
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
    return this.uint8ArrayToBase64Url(bytes);
  }

  /**
   * Converts a Uint8Array to a Base64URL string (RFC 4648 §5).
   * Replaces + → -, / → _, strips trailing =.
   */
  uint8ArrayToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
