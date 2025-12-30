
export interface Product {
  id: string;
  sku: string;
  description: string;
  normalPrice: string;
  specialPrice: string;
  brand: string;
  fileName: string;
}

export interface ProcessingFile {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  extractedCount?: number;
}

export enum ExtractionStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
