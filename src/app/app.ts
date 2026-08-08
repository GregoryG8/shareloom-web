import { Component, inject, signal, OnInit } from '@angular/core';
import { CryptoService } from './services/crypto.service';
import { UploadService } from './services/upload.service';
import { UploadState, STATE_MESSAGES } from './models/upload-state.model';

/**
 * AppComponent — Main orchestrator for the ShareLoom upload flow.
 *
 * Responsibilities:
 * - UI state management
 * - User event handling (file selection)
 * - Orchestrating the encrypt → request URL → upload pipeline
 * - Building the zero-knowledge share URL
 *
 * Security: The original file and the AES key never leave the browser.
 * The key is placed exclusively in the URL fragment (#), which is not
 * transmitted over HTTP.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly cryptoService = inject(CryptoService);
  private readonly uploadService = inject(UploadService);

  // --- State signals ---
  state = signal<UploadState>('idle');
  fileName = signal<string>('');
  fileSize = signal<number>(0);
  fileType = signal<string>('');
  shareUrl = signal<string>('');
  errorMessage = signal<string>('');
  copied = signal<boolean>(false);
  cryptoSupported = signal<boolean>(true);

  /** State messages map for the template */
  readonly stateMessages = STATE_MESSAGES;

  ngOnInit(): void {
    // Check Web Crypto API support on initialization
    if (!this.cryptoService.isSupported()) {
      this.cryptoSupported.set(false);
      this.showError(
        'Tu navegador no soporta la Web Crypto API. Utiliza un navegador moderno (Chrome, Firefox, Safari, Edge).',
      );
    }
  }

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

    await this.processFile(selectedFile);
  }

  /**
   * Orchestrates the full end-to-end encrypted upload flow.
   *
   * Flow order:
   * 1. Read file → ArrayBuffer
   * 2. Generate AES-256-GCM key
   * 3. Generate random IV & encrypt
   * 4. POST /upload → get uploadUrl + fileId
   * 5. PUT encrypted bytes to S3
   * 6. Export key → Base64URL
   * 7. Build share URL with key in fragment only
   */
  private async processFile(file: File): Promise<void> {
    try {
      // Step 1: Read file into memory
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
      } catch {
        throw new Error('No se pudo leer el archivo. Verifica que el archivo sea accesible.');
      }

      // Step 2 & 3: Generate key + encrypt (IV generated inside encryptFile)
      this.state.set('encrypting');
      const cryptoKey = await this.cryptoService.generateKey();
      const encryptedBytes = await this.cryptoService.encryptFile(arrayBuffer, cryptoKey);

      // Step 4: Request pre-signed URL from API Gateway
      this.state.set('requesting-upload-url');
      const { uploadUrl, fileId } = await this.uploadService.requestUploadUrl(
        file.name,
        file.type || 'application/octet-stream',
      );

      // Step 5: Upload ONLY encrypted bytes to S3
      this.state.set('uploading');
      await this.uploadService.uploadToS3(uploadUrl, encryptedBytes);

      // Step 6: Export key to Base64URL
      const base64UrlKey = await this.cryptoService.exportKeyToBase64Url(cryptoKey);

      // Step 7: Build share URL — key lives ONLY in the fragment (#)
      const shareLink = `${window.location.origin}/#${fileId}:${base64UrlKey}`;
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

  /**
   * Copies the share URL to the clipboard with visual feedback.
   */
  async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // Fallback: select the input text for manual copy
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
    this.state.set('idle');
    this.fileName.set('');
    this.fileSize.set(0);
    this.fileType.set('');
    this.shareUrl.set('');
    this.errorMessage.set('');
    this.copied.set(false);
  }

  /**
   * Returns true if the app is in a processing (in-progress) state.
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
