/** Theme */
export const STORAGE_THEME_KEY = '__db_gpt_theme_key';
/** Language */
export const STORAGE_LANG_KEY = '__db_gpt_lng_key';
/** Init Message */
export const STORAGE_INIT_MESSAGE_KET = '__db_gpt_im_key';
/** Flow nodes */
export const FLOW_NODES_KEY = '__db_gpt_static_flow_nodes_key';

let sqlFormatterModule: typeof import('sql-formatter') | null = null;
let sqlFormatterPromise: Promise<typeof import('sql-formatter')> | null = null;

export async function loadSqlFormatter() {
  if (sqlFormatterModule) return sqlFormatterModule;
  if (!sqlFormatterPromise) {
    sqlFormatterPromise = import('sql-formatter').then(mod => {
      sqlFormatterModule = mod;
      return mod;
    });
  }
  return sqlFormatterPromise;
}

export function formatSql(sql: string, lang?: string) {
  if (!sql) return '';
  if (sqlFormatterModule) {
    try {
      return sqlFormatterModule.format(sql, { language: lang as any });
    } catch {
      return sql;
    }
  }
  // Start lazy loading in background so subsequent calls format properly
  loadSqlFormatter().catch(() => {});
  return sql;
}

export async function formatSqlAsync(sql: string, lang?: string): Promise<string> {
  if (!sql) return '';
  try {
    const mod = await loadSqlFormatter();
    return mod.format(sql, { language: lang as any });
  } catch {
    return sql;
  }
}

// Utility function to transform dbgpt-fs:// URLs to HTTP service URLs
export const transformFileUrl = (url: string): string => {
  try {
    if (!url.startsWith('dbgpt-fs://')) {
      return url;
    }

    // Parse the dbgpt-fs:// URL structure
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'dbgpt-fs:') {
      return url;
    }

    // const storageType = parsedUrl.hostname;
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) {
      return url; // Not enough path parts
    }

    const bucket = pathParts[0];
    const fileId = pathParts[1];

    // Transform to service URL
    // Using process.env.API_BASE_URL as the base
    return `${process.env.API_BASE_URL || ''}/api/v2/serve/file/files/${bucket}/${fileId}${parsedUrl.search}`;
  } catch (e) {
    console.error('Error transforming file URL:', e);
    return url; // Return original URL if transformation fails
  }
};

// Parse resourceValue to get the resource array
export const parseResourceValue = (value: any): any[] => {
  // Return empty array if value is empty string or undefined
  if (!value || value === 'undefined' || value === 'null') {
    return [];
  }

  try {
    // If the value is a string, try to parse it as JSON
    // Plain strings (e.g. knowledge space names like "知识库1") are not valid JSON,
    // skip JSON.parse to avoid noisy console errors
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
        return [];
      }
    }
    let resourceData = typeof value === 'string' ? JSON.parse(value) : value;

    // If resourceData is not an array but an object, convert it to array format
    if (resourceData && !Array.isArray(resourceData) && typeof resourceData === 'object') {
      // If it has file_name or file_path, convert to appropriate type
      if (resourceData.file_name || resourceData.file_path) {
        const fileName = resourceData.file_name || '';
        const filePath = resourceData.file_path || resourceData.url || '';

        const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName);
        const isAudio = /\.(mp3|wav|ogg|aac|flac|m4a)$/i.test(fileName);
        const isVideo = /\.(mp4|webm|mov|avi|wmv|flv|mkv)$/i.test(fileName);

        if (isImage) {
          resourceData = [
            {
              type: 'image_url',
              image_url: {
                url: filePath,
                fileName: fileName,
              },
            },
          ];
        } else if (isAudio) {
          resourceData = [
            {
              type: 'audio_url',
              audio_url: {
                url: filePath,
                file_name: fileName,
              },
            },
          ];
        } else if (isVideo) {
          resourceData = [
            {
              type: 'video_url',
              video_url: {
                url: filePath,
                file_name: fileName,
              },
            },
          ];
        } else {
          // Other file types
          resourceData = [
            {
              type: 'file_url',
              file_url: {
                url: filePath,
                file_name: fileName,
              },
            },
          ];
        }
      } else {
        resourceData = [resourceData];
      }
    } else if (!Array.isArray(resourceData)) {
      return [];
    }

    return resourceData;
  } catch (error) {
    console.error('Parse resourceValue error:', error);
    return [];
  }
};

export * from './constants';
export * from './json';
export * from './storage';

