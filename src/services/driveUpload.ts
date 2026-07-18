/**
 * Google Drive report uploads using Google Identity Services (GIS).
 *
 * Access tokens are intentionally kept in memory. They are never persisted in
 * localStorage, sessionStorage, IndexedDB, URLs, or application settings.
 */

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT_ID = 'google-identity-services';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleIdentityServices = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback: (error: { type?: string }) => void;
      }) => GoogleTokenClient;
      revoke: (token: string, callback?: () => void) => void;
    };
  };
};

let accessToken = '';
let accessTokenExpiresAt = 0;
let gisLoadPromise: Promise<GoogleIdentityServices> | null = null;

function getGoogleIdentityServices(): GoogleIdentityServices | null {
  if (typeof window === 'undefined') return null;
  return (window as typeof window & { google?: GoogleIdentityServices }).google ?? null;
}

function clearLegacyPersistedTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('gdrive_access_token');
  localStorage.removeItem('gdrive_token_expires');
}

function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  const available = getGoogleIdentityServices();
  if (available) return Promise.resolve(available);
  if (gisLoadPromise) return gisLoadPromise;

  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Google Drive authentication requires a browser.'));
  }

  gisLoadPromise = new Promise<GoogleIdentityServices>((resolve, reject) => {
    const handleReady = () => {
      const gis = getGoogleIdentityServices();
      if (gis) {
        resolve(gis);
      } else {
        reject(new Error('Google Identity Services did not initialize.'));
      }
    };

    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', handleReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google Identity Services.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleReady, { once: true });
    script.addEventListener('error', () => reject(new Error('Could not load Google Identity Services.')), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    gisLoadPromise = null;
    throw error;
  });

  return gisLoadPromise;
}

/** Return the current in-memory token when it is still valid. */
export function getStoredToken(): string | null {
  if (!accessToken || Date.now() >= accessTokenExpiresAt) {
    accessToken = '';
    accessTokenExpiresAt = 0;
    return null;
  }
  return accessToken;
}

export function isDriveConnected(): boolean {
  return getStoredToken() !== null;
}

/** Authenticate with Google's supported GIS token client. */
export async function authenticateGDrive(clientId: string): Promise<string> {
  const normalizedClientId = clientId?.trim();
  if (!normalizedClientId) {
    throw new Error('Google Client ID is not configured. Please set it in Settings.');
  }
  if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(normalizedClientId)) {
    throw new Error('Google Client ID format is invalid.');
  }

  clearLegacyPersistedTokens();
  const gis = await loadGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    const tokenClient = gis.accounts.oauth2.initTokenClient({
      client_id: normalizedClientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google authentication was denied.'));
          return;
        }

        const expiresInSeconds = Math.max(60, Number(response.expires_in) || 3600);
        accessToken = response.access_token;
        // Expire locally one minute early so an upload never starts with a stale token.
        accessTokenExpiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
        resolve(accessToken);
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_failed_to_open'
          ? 'Authentication popup was blocked. Please allow popups for this site.'
          : 'Google authentication was cancelled or failed.'));
      }
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export function disconnectGDrive(): void {
  const token = accessToken;
  accessToken = '';
  accessTokenExpiresAt = 0;
  clearLegacyPersistedTokens();

  const gis = getGoogleIdentityServices();
  if (token && gis) {
    gis.accounts.oauth2.revoke(token, () => undefined);
  }
}

function throwDriveError(response: Response, operation: string): never {
  if (response.status === 401) disconnectGDrive();
  throw new Error(`${operation} failed (${response.status}). Please reconnect Google Drive and try again.`);
}

async function getOrCreateFolder(token: string, folderName: string, parentId: string | null = null): Promise<string> {
  const escapedFolderName = folderName.replace(/([\\'])/g, '\\$1');
  let query = `name = '${escapedFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const searchResponse = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!searchResponse.ok) throwDriveError(searchResponse, 'Google Drive folder search');

  const searchResult = await searchResponse.json() as { files?: Array<{ id?: string }> };
  const existingId = searchResult.files?.[0]?.id;
  if (existingId) return existingId;

  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) metadata.parents = [parentId];

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  if (!createResponse.ok) throwDriveError(createResponse, 'Google Drive folder creation');

  const createResult = await createResponse.json() as { id?: string };
  if (!createResult.id) throw new Error('Google Drive did not return the new folder ID.');
  return createResult.id;
}

export async function uploadToDrive(blob: Blob, filename: string): Promise<{ success: true; fileId: string; link: string }> {
  const token = getStoredToken();
  if (!token) throw new Error('Google Drive is not connected or the session has expired.');

  const rootFolderId = await getOrCreateFolder(token, 'TheTaste Reports');
  const lowerFilename = filename.toLowerCase();
  const subfolderName = lowerFilename.includes('daily')
    ? 'Daily'
    : lowerFilename.includes('weekly')
      ? 'Weekly'
      : lowerFilename.includes('monthly')
        ? 'Monthly'
        : 'Others';
  const subfolderId = await getOrCreateFolder(token, subfolderName, rootFolderId);

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: filename, parents: [subfolderId] })], { type: 'application/json' }));
  form.append('file', blob);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!response.ok) throwDriveError(response, 'Google Drive upload');

  const result = await response.json() as { id?: string; webViewLink?: string };
  if (!result.id) throw new Error('Google Drive did not return the uploaded file ID.');
  return {
    success: true,
    fileId: result.id,
    link: result.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(result.id)}`
  };
}
