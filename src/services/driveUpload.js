/**
 * ═══════════════════════════════════════════════════
 *  The Taste POS — Google Drive Integration Service
 *  Module: OAuth Authentication & Direct REST Uploads
 *  Version: 1.0.0
 *  © 2026 The Taste. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 */

import { getSetting } from '../db/database.js';

/**
 * Get stored token if valid
 * @returns {string|null} Access token or null
 */
export function getStoredToken() {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('gdrive_access_token');
  const expires = localStorage.getItem('gdrive_token_expires');
  if (token && expires && Date.now() < parseInt(expires)) {
    return token;
  }
  return null;
}

/**
 * Is connected to Google Drive?
 * @returns {boolean} True if connected
 */
export function isDriveConnected() {
  return getStoredToken() !== null;
}

/**
 * Authenticate with Google OAuth (using a popup)
 * @param {string} clientId - Google Client ID
 * @returns {Promise<string>} Google Access Token
 */
export async function authenticateGDrive(clientId) {
  if (!clientId) {
    throw new Error('Google Client ID is not configured. Please set it in Settings.');
  }

  const redirectUri = window.location.origin + window.location.pathname;
  const scope = 'https://www.googleapis.com/auth/drive.file';
  const state = 'gdrive_auth';

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=token&` +
    `scope=${encodeURIComponent(scope)}&` +
    `state=${state}`;

  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    const popup = window.open(authUrl, 'Google Drive Auth', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      reject(new Error('Authentication popup was blocked! Please enable popups for this site.'));
      return;
    }

    const interval = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(interval);
          reject(new Error('Authentication window closed by user.'));
          return;
        }

        const href = popup.location.href;
        if (href && (href.includes('access_token=') || href.includes('error='))) {
          clearInterval(interval);
          
          if (href.includes('error=')) {
            popup.close();
            reject(new Error('Google authentication was denied.'));
            return;
          }

          const hash = popup.location.hash || popup.location.search;
          const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
          const token = params.get('access_token');
          const expires = params.get('expires_in') || '3600';

          popup.close();
          if (token) {
            localStorage.setItem('gdrive_access_token', token);
            localStorage.setItem('gdrive_token_expires', String(Date.now() + parseInt(expires) * 1000));
            resolve(token);
          } else {
            reject(new Error('Failed to retrieve access token from Google response.'));
          }
        }
      } catch (e) {
        // Cross-origin access warnings are expected until popup redirects back to redirectUri
      }
    }, 500);
  });
}

/**
 * Disconnect Google Drive
 */
export function disconnectGDrive() {
  localStorage.removeItem('gdrive_access_token');
  localStorage.removeItem('gdrive_token_expires');
}

/**
 * Get or create folder in Drive
 * @param {string} token - Google Access Token
 * @param {string} folderName - Name of the folder
 * @param {string} [parentId] - Optional parent folder ID
 * @returns {Promise<string>} Folder ID
 */
async function getOrCreateFolder(token, folderName, parentId = null) {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  // 1. Search for existing folder
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchResponse.ok) {
    throw new Error(`Google Drive API search failed: ${searchResponse.statusText}`);
  }

  const searchResult = await searchResponse.json();
  if (searchResult.files && searchResult.files.length > 0) {
    return searchResult.files[0].id;
  }

  // 2. Create new folder
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createResponse.ok) {
    throw new Error(`Google Drive API folder creation failed: ${createResponse.statusText}`);
  }

  const createResult = await createResponse.json();
  return createResult.id;
}

/**
 * Upload file blob to Google Drive (in "TheTaste Reports" folder hierarchy)
 * @param {Blob} blob - Binary Excel data
 * @param {string} filename - Name of file
 * @returns {Promise<Object>} Upload result details
 */
export async function uploadToDrive(blob, filename) {
  const token = getStoredToken();
  if (!token) {
    throw new Error('Google Drive is not connected or session has expired.');
  }

  try {
    // 1. Ensure root "TheTaste Reports" folder exists
    const rootFolderId = await getOrCreateFolder(token, 'TheTaste Reports');

    // 2. Determine subfolder based on report type in filename
    let subfolderName = 'Others';
    if (filename.toLowerCase().includes('daily')) {
      subfolderName = 'Daily';
    } else if (filename.toLowerCase().includes('weekly')) {
      subfolderName = 'Weekly';
    } else if (filename.toLowerCase().includes('monthly')) {
      subfolderName = 'Monthly';
    }
    
    const subfolderId = await getOrCreateFolder(token, subfolderName, rootFolderId);

    // 3. Perform multipart upload
    const metadata = {
      name: filename,
      parents: [subfolderId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: true,
      fileId: result.id,
      link: result.webViewLink
    };
  } catch (error) {
    console.error('[DriveUpload] Error uploading to Drive:', error);
    throw error;
  }
}
