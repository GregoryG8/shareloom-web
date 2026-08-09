/**
 * Represents every possible state in the application.
 * Covers both upload and download flows.
 */
export type AppState =
  | 'idle'
  | 'file-selected'
  | 'encrypting'
  | 'requesting-upload-url'
  | 'uploading'
  | 'success'
  | 'downloading'
  | 'deleting'
  | 'decrypting'
  | 'download-ready'
  | 'error';

/**
 * Response shape returned by POST /upload (API Gateway → Lambda).
 */
export interface UploadResponse {
  uploadUrl: string;
  fileId: string;
}

/**
 * Response shape returned by GET /download/:fileId (API Gateway → Lambda).
 */
export interface DownloadResponse {
  downloadUrl: string;
}

/**
 * Metadata about the file the user selected.
 */
export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

/**
 * Represents the decrypted file ready for user interaction.
 */
export interface DecryptedFile {
  blob: Blob;
  objectUrl: string;
  safeUrl: unknown; // SafeResourceUrl from DomSanitizer
  mimeType: string;
  fileName: string;
}

/**
 * Maps each app state to a user-facing status message.
 */
export const STATE_MESSAGES: Record<AppState, string> = {
  idle: 'Selecciona un archivo para cifrar y compartir',
  'file-selected': 'Preparando archivo...',
  encrypting: 'Cifrando archivo localmente (AES-256-GCM)...',
  'requesting-upload-url': 'Preparando subida segura...',
  uploading: 'Subiendo archivo cifrado...',
  success: 'Archivo protegido correctamente',
  downloading: 'Descargando archivo cifrado...',
  deleting: 'Eliminando archivo del servidor...',
  decrypting: 'Descifrando archivo localmente...',
  'download-ready': 'Archivo descifrado correctamente',
  error: 'Ha ocurrido un error',
};
