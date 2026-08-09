/**
 * ShareLoom Environment Configuration
 *
 * Centralizes all external URLs and configuration values.
 * Replace API_URL with your actual API Gateway endpoint before deployment.
 */
export const environment = {
  apiUrl: 'https://14nnmfbyt2.execute-api.us-east-1.amazonaws.com',
  appName: 'ShareLoom',
  appDomain: 'shareloom.com',
} as const;
