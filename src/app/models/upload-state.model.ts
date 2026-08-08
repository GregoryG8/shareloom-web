/**
 * Represents every possible state in the file upload flow.
 */
export type UploadState =
  | 'idle'
  | 'file-selected'
  | 'encrypting'
  | 'requesting-upload-url'
  | 'uploading'
  | 'success'
  | 'error';

/**
 * Response shape returned by POST /upload (API Gateway → Lambda).
 */
export interface UploadResponse {
  uploadUrl: string;
  fileId: string;
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
 * Maps each upload state to a user-facing status message.
 */
export const STATE_MESSAGES: Record<UploadState, string> = {
  idle: 'Selecciona un archivo para cifrar y compartir',
  'file-selected': 'Preparando archivo...',
  encrypting: 'Cifrando archivo localmente (AES-256-GCM)...',
  'requesting-upload-url': 'Preparando subida segura...',
  uploading: 'Subiendo archivo cifrado...',
  success: 'Archivo protegido correctamente',
  error: 'Ha ocurrido un error',
};
