/**
 * ShareLoom Environment Configuration
 *
 * Centralizes all external URLs and configuration values.
 * Replace API_URL with your actual API Gateway endpoint before deployment.
 */
export const environment = {
  // TODO: Reemplazar con la URL real de tu API Gateway
  apiUrl: 'https://API_GATEWAY_URL',
  appName: 'ShareLoom',
  appDomain: 'shareloom.com',
} as const;
