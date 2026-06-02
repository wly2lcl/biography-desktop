export interface WorldMeta {
  name: string;
  filename: string;
  type: 'single' | 'directory';
  description: string;
  isBuiltIn: boolean;
  fileSize: number;
  fileCount: number;
  lastModified: string;
}

export interface WorldExport {
  meta: WorldMeta;
  content: string | DirectoryEntry[];
}

export interface DirectoryEntry {
  path: string;
  content: string;
}
