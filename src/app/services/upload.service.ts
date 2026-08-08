import { Injectable } from '@angular/core';
import { environment } from '../config/environment';
import { UploadResponse } from '../models/upload-state.model';

/**
 * UploadService — handles all network communication for file uploads.
 *
 * Responsibilities:
 * 1. POST /upload → obtains a pre-signed S3 URL and fileId from API Gateway.
 * 2. PUT encrypted bytes → uploads directly to S3 using the pre-signed URL.
 *
 * Security guarantees:
 * - Only encrypted bytes are ever transmitted over the network.
 * - The AES key is NEVER sent to any server endpoint.
 * - No extra headers are added to the S3 PUT to avoid signature mismatch.
 */
@Injectable({
  providedIn: 'root',
})
export class UploadService {
  private readonly uploadEndpoint = `${environment.apiUrl}/upload`;

  /**
   * Requests a pre-signed upload URL and file ID from the backend.
   *
   * @param fileName - Original file name (for metadata/logging on backend)
   * @param contentType - MIME type of the original file
   * @returns UploadResponse with uploadUrl and fileId
   */
  async requestUploadUrl(fileName: string, contentType: string): Promise<UploadResponse> {
    const response = await fetch(this.uploadEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName, contentType }),
    });

    if (!response.ok) {
      throw new Error(
        `Error solicitando URL de subida (HTTP ${response.status}): ${response.statusText}`,
      );
    }

    const data: unknown = await response.json();

    if (!this.isValidUploadResponse(data)) {
      throw new Error('La respuesta del servidor no tiene el formato esperado.');
    }

    return data;
  }

  /**
   * Uploads encrypted bytes directly to S3 via the pre-signed URL.
   *
   * Important: No extra headers are set to avoid breaking the pre-signed URL
   * signature. The body contains ONLY the encrypted payload (IV + ciphertext).
   *
   * @param uploadUrl - S3 pre-signed PUT URL
   * @param encryptedData - The encrypted file as an ArrayBuffer (IV prepended)
   */
  async uploadToS3(uploadUrl: string, encryptedData: ArrayBuffer): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: encryptedData,
    });

    if (!response.ok) {
      throw new Error(
        `Error al subir archivo cifrado a S3 (HTTP ${response.status}): ${response.statusText}`,
      );
    }
  }

  /**
   * Type guard to validate the upload response shape.
   */
  private isValidUploadResponse(data: unknown): data is UploadResponse {
    return (
      typeof data === 'object' &&
      data !== null &&
      'uploadUrl' in data &&
      'fileId' in data &&
      typeof (data as UploadResponse).uploadUrl === 'string' &&
      typeof (data as UploadResponse).fileId === 'string'
    );
  }
}
