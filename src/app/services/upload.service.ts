import { Injectable } from '@angular/core';
import { environment } from '../config/environment';
import { UploadResponse, DownloadResponse } from '../models/upload-state.model';

/**
 * UploadService — handles all network communication for file uploads and downloads.
 *
 * Responsibilities:
 * 1. POST /upload → obtains a pre-signed S3 URL and fileId from API Gateway.
 * 2. PUT encrypted bytes → uploads directly to S3 using the pre-signed URL.
 * 3. GET /download/:fileId → obtains a pre-signed download URL.
 * 4. GET downloadUrl → fetches encrypted bytes from S3.
 * 5. DELETE /file/:fileId → purges the file from S3 after successful download.
 *
 * Security guarantees:
 * - Only encrypted bytes are ever transmitted over the network.
 * - The AES key is NEVER sent to any server endpoint.
 * - No extra headers are added to the S3 PUT/GET to avoid signature mismatch.
 */
@Injectable({
  providedIn: 'root',
})
export class UploadService {
  private readonly apiUrl = environment.apiUrl;

  /**
   * Requests a pre-signed upload URL and file ID from the backend.
   *
   * @param fileName - Original file name (for metadata/logging on backend)
   * @param contentType - MIME type of the original file
   * @returns UploadResponse with uploadUrl and fileId
   */
  async requestUploadUrl(fileName: string, contentType: string): Promise<UploadResponse> {
    const response = await fetch(`${this.apiUrl}/upload`, {
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
   * signature. The body contains ONLY the encrypted payload (ciphertext + auth tag).
   *
   * @param uploadUrl - S3 pre-signed PUT URL
   * @param encryptedData - The encrypted file as an ArrayBuffer
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
   * Requests a pre-signed download URL from the backend.
   *
   * @param fileId - The unique file identifier from the share URL
   * @returns DownloadResponse with downloadUrl
   */
  async getDownloadUrl(fileId: string): Promise<DownloadResponse> {
    const response = await fetch(`${this.apiUrl}/download/${fileId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('El archivo no existe o ya fue eliminado.');
      }
      throw new Error(
        `Error solicitando URL de descarga (HTTP ${response.status}): ${response.statusText}`,
      );
    }

    const data: unknown = await response.json();

    if (!this.isValidDownloadResponse(data)) {
      throw new Error('La respuesta del servidor no tiene el formato esperado.');
    }

    return data;
  }

  /**
   * Downloads encrypted bytes from S3 via the pre-signed download URL.
   *
   * @param downloadUrl - S3 pre-signed GET URL
   * @returns The encrypted file contents as ArrayBuffer
   */
  async downloadFromS3(downloadUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(downloadUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(
        `Error descargando archivo cifrado (HTTP ${response.status}): ${response.statusText}`,
      );
    }

    return response.arrayBuffer();
  }

  /**
   * Deletes the file from S3 via the backend after successful download.
   * This ensures the file is only downloadable once (ephemeral sharing).
   *
   * @param fileId - The unique file identifier
   */
  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/file/${fileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      // Non-critical: file may already be deleted or TTL-expired.
      // Log but don't throw — the user already has the decrypted file.
      console.warn(`No se pudo eliminar el archivo del servidor (HTTP ${response.status}).`);
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

  /**
   * Type guard to validate the download response shape.
   */
  private isValidDownloadResponse(data: unknown): data is DownloadResponse {
    return (
      typeof data === 'object' &&
      data !== null &&
      'downloadUrl' in data &&
      typeof (data as DownloadResponse).downloadUrl === 'string'
    );
  }
}
