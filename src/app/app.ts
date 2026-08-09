import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CryptoService } from './services/crypto.service';
import { UploadService } from './services/upload.service';
import { AppState, DecryptedFile, STATE_MESSAGES } from './models/upload-state.model';

/**
 * AppComponent — Main orchestrator for the ShareLoom upload & download flows.
 *
 * Upload flow:
 * 1. User selects file → read → generate key + IV → encrypt → POST /upload →
 *    PUT ciphertext to S3 → build share URL with #fileId:key:iv:mimeType:fileName
 *
 * Download flow (triggered when URL contains #fileId:key:iv:mimeType:fileName):
 * 1. Parse fragment → GET /download/:fileId → fetch encrypted bytes from S3 →
 *    DELETE /file/:fileId → decrypt locally → sanitize blob URL → present file
 *
 * URL hash format: #fileId:keyBase64:ivBase64:mimeType:fileName
 *
 * Security:
 * - The original file and the AES key never leave the browser.
 * - The key + IV travel exclusively in the URL fragment (#), never sent over HTTP.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly cryptoService = inject(CryptoService);
  private readonly uploadService = inject(UploadService);
  private readonly sanitizer = inject(DomSanitizer);

  // --- State signals ---
  state = signal<AppState>('idle');
  fileName = signal<string>('');
  fileSize = signal<number>(0);
  fileType = signal<string>('');
  shareUrl = signal<string>('');
  errorMessage = signal<string>('');
  copied = signal<boolean>(false);
  cryptoSupported = signal<boolean>(true);

  // --- Download-specific signals ---
  decryptedFile = signal<DecryptedFile | null>(null);
  safeBlobUrl = signal<SafeResourceUrl | null>(null);

  /** State messages map for the template */
  readonly stateMessages = STATE_MESSAGES;

  ngOnInit(): void {
    // Check Web Crypto API support
    if (!this.cryptoService.isSupported()) {
      this.cryptoSupported.set(false);
      this.showError(
        'Tu navegador no soporta la Web Crypto API. Utiliza un navegador moderno (Chrome, Firefox, Safari, Edge).',
      );
      return;
    }

    // Check if the URL fragment contains download params
    this.checkForDownloadFragment();
  }

  ngOnDestroy(): void {
    // Revoke any object URLs to prevent memory leaks
    const file = this.decryptedFile();
    if (file?.objectUrl) {
      URL.revokeObjectURL(file.objectUrl);
    }
  }

  // =========================================================================
  // UPLOAD FLOW
  // =========================================================================

  /**
   * Handles file selection from the input element.
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const selectedFile = input.files[0];

    if (selectedFile.size === 0) {
      this.showError('El archivo seleccionado está vacío.');
      return;
    }

    this.fileName.set(selectedFile.name);
    this.fileSize.set(selectedFile.size);
    this.fileType.set(selectedFile.type || 'application/octet-stream');
    this.state.set('file-selected');

    await this.processUpload(selectedFile);
  }

  /**
   * Orchestrates the full end-to-end encrypted upload flow.
   *
   * Flow:
   * 1. Read file → ArrayBuffer
   * 2. Generate AES-256-GCM key
   * 3. Generate random IV
   * 4. Encrypt file (ciphertext only, IV separate)
   * 5. POST /upload → get uploadUrl + fileId
   * 6. PUT ciphertext to S3
   * 7. Export key + IV → Base64URL
   * 8. Build share URL: #fileId:key:iv:mimeType:fileName
   */
  private async processUpload(file: File): Promise<void> {
    try {
      // Step 1: Read file into memory
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
      } catch {
        throw new Error('No se pudo leer el archivo. Verifica que el archivo sea accesible.');
      }

      // Step 2: Generate AES-256-GCM key
      this.state.set('encrypting');
      const cryptoKey = await this.cryptoService.generateKey();

      // Step 3: Generate random IV (12 bytes)
      const iv = this.cryptoService.generateIv();

      // Step 4: Encrypt (returns only ciphertext + auth tag)
      const encryptedBytes = await this.cryptoService.encryptFile(arrayBuffer, cryptoKey, iv);

      // Step 5: Request pre-signed URL from API Gateway
      this.state.set('requesting-upload-url');
      const { uploadUrl, fileId } = await this.uploadService.requestUploadUrl(
        file.name,
        file.type || 'application/octet-stream',
      );

      // Step 6: Upload ONLY encrypted bytes to S3
      this.state.set('uploading');
      await this.uploadService.uploadToS3(uploadUrl, encryptedBytes);

      // Step 7: Export key and IV to Base64URL
      const base64UrlKey = await this.cryptoService.exportKeyToBase64Url(cryptoKey);
      const base64UrlIv = this.cryptoService.uint8ArrayToBase64Url(iv);

      // Step 8: Build share URL — key, IV, mimeType, fileName in fragment only
      const mimeType = encodeURIComponent(file.type || 'application/octet-stream');
      const encodedFileName = encodeURIComponent(file.name);
      const shareLink = `${window.location.origin}/#${fileId}:${base64UrlKey}:${base64UrlIv}:${mimeType}:${encodedFileName}`;
      this.shareUrl.set(shareLink);
      this.state.set('success');
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Hubo un problema procesando el archivo. Por favor intenta de nuevo.';
      this.showError(message);
    }
  }

  // =========================================================================
  // DOWNLOAD FLOW
  // =========================================================================

  /**
   * Checks the URL fragment for download parameters.
   * Expected format: #fileId:keyBase64:ivBase64:mimeType:fileName
   */
  private checkForDownloadFragment(): void {
    const fragment = window.location.hash;
    if (!fragment || fragment.length < 2) {
      return; // No fragment, stay in upload mode
    }

    // Split on first 4 colons only (fileName may contain colons)
    const raw = fragment.substring(1);
    const parts = this.splitFragment(raw);

    if (!parts) {
      return; // Not a valid download URL, stay in upload mode
    }

    const { fileId, base64UrlKey, base64UrlIv, mimeType, fileName } = parts;

    // Start the download flow
    this.processDownload(fileId, base64UrlKey, base64UrlIv, mimeType, fileName);
  }

  /**
   * Splits the URL fragment into its 5 components.
   * Format: fileId:key:iv:mimeType:fileName
   * Uses indexOf to handle colons that may appear in fileName.
   */
  private splitFragment(raw: string): {
    fileId: string;
    base64UrlKey: string;
    base64UrlIv: string;
    mimeType: string;
    fileName: string;
  } | null {
    // Find first 4 colons
    const indices: number[] = [];
    for (let i = 0; i < raw.length && indices.length < 4; i++) {
      if (raw[i] === ':') {
        indices.push(i);
      }
    }

    if (indices.length < 4) {
      return null;
    }

    const fileId = raw.substring(0, indices[0]);
    const base64UrlKey = raw.substring(indices[0] + 1, indices[1]);
    const base64UrlIv = raw.substring(indices[1] + 1, indices[2]);
    const mimeType = decodeURIComponent(raw.substring(indices[2] + 1, indices[3]));
    const fileName = decodeURIComponent(raw.substring(indices[3] + 1));

    if (!fileId || !base64UrlKey || !base64UrlIv || !mimeType || !fileName) {
      return null;
    }

    return { fileId, base64UrlKey, base64UrlIv, mimeType, fileName };
  }

  /**
   * Orchestrates the full download + decrypt + delete flow.
   *
   * Flow:
   * 1. GET /download/:fileId → obtain downloadUrl
   * 2. Fetch encrypted bytes from S3 downloadUrl
   * 3. DELETE /file/:fileId → purge from S3 (fire after download completes)
   * 4. Import key from Base64URL
   * 5. Restore IV from Base64URL
   * 6. Decrypt ArrayBuffer with AES-GCM
   * 7. Create Blob with mimeType from URL → sanitize with DomSanitizer
   */
  private async processDownload(
    fileId: string,
    base64UrlKey: string,
    base64UrlIv: string,
    mimeType: string,
    fileName: string,
  ): Promise<void> {
    try {
      // Step 1: Get pre-signed download URL
      this.state.set('downloading');
      const { downloadUrl } = await this.uploadService.getDownloadUrl(fileId);

      // Step 2: Fetch encrypted bytes from S3
      const encryptedData = await this.uploadService.downloadFromS3(downloadUrl);

      // Step 3: Delete file from S3 (file already in memory)
      this.state.set('deleting');
      await this.uploadService.deleteFile(fileId);

      // Step 4: Import key from Base64URL
      this.state.set('decrypting');
      const cryptoKey = await this.cryptoService.importKeyFromBase64Url(base64UrlKey);

      // Step 5: Restore IV from Base64URL
      const iv = this.cryptoService.base64UrlToUint8Array(base64UrlIv);

      // Step 6: Decrypt
      const decryptedBuffer = await this.cryptoService.decryptFile(encryptedData, cryptoKey, iv);

      // Step 7: Create Blob with mimeType from URL, sanitize with DomSanitizer
      const blob = new Blob([decryptedBuffer], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);

      this.decryptedFile.set({ blob, objectUrl, safeUrl, mimeType, fileName });
      this.safeBlobUrl.set(safeUrl);
      this.fileName.set(fileName);
      this.fileSize.set(decryptedBuffer.byteLength);
      this.fileType.set(mimeType);
      this.state.set('download-ready');

      // Clean hash from URL (without reloading page)
      window.history.replaceState(null, '', window.location.pathname);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo descargar o descifrar el archivo.';
      this.showError(message);
    }
  }

  // =========================================================================
  // FILE PRESENTATION HELPERS
  // =========================================================================

  /**
   * Triggers a local download of the decrypted file with original filename.
   */
  downloadDecryptedFile(): void {
    const file = this.decryptedFile();
    if (!file) return;

    const a = document.createElement('a');
    a.href = file.objectUrl;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Returns true if the mime type represents an image.
   */
  isImage(): boolean {
    return this.fileType().startsWith('image/');
  }

  /**
   * Returns true if the mime type is a PDF.
   */
  isPdf(): boolean {
    return this.fileType() === 'application/pdf';
  }

  /**
   * Returns true if the mime type represents audio.
   */
  isAudio(): boolean {
    return this.fileType().startsWith('audio/');
  }

  // =========================================================================
  // SHARED UI HELPERS
  // =========================================================================

  /**
   * Copies the share URL to the clipboard with visual feedback.
   */
  async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      const input = document.querySelector<HTMLInputElement>('.url-input');
      if (input) {
        input.select();
        input.setSelectionRange(0, input.value.length);
      }
    }
  }

  /**
   * Resets the component to its initial idle state.
   */
  reset(): void {
    // Revoke object URL if present
    const file = this.decryptedFile();
    if (file?.objectUrl) {
      URL.revokeObjectURL(file.objectUrl);
    }

    this.state.set('idle');
    this.fileName.set('');
    this.fileSize.set(0);
    this.fileType.set('');
    this.shareUrl.set('');
    this.errorMessage.set('');
    this.copied.set(false);
    this.decryptedFile.set(null);
    this.safeBlobUrl.set(null);
  }

  /**
   * Returns true if the app is in an upload processing state.
   */
  isProcessing(): boolean {
    const s = this.state();
    return (
      s === 'file-selected' ||
      s === 'encrypting' ||
      s === 'requesting-upload-url' ||
      s === 'uploading'
    );
  }

  /**
   * Returns true if the app is in a download processing state.
   */
  isDownloading(): boolean {
    const s = this.state();
    return s === 'downloading' || s === 'deleting' || s === 'decrypting';
  }

  /**
   * Formats bytes to a human-readable string.
   */
  formatBytes(bytes: number, decimals = 2): string {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  private showError(message: string): void {
    this.errorMessage.set(message);
    this.state.set('error');
  }
}
