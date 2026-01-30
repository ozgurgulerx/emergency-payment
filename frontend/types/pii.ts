// PII Detection Types
export interface PiiEntity {
  text: string;
  category: string;
  offset: number;
  length: number;
  confidenceScore: number;
}

export interface PiiCheckResult {
  hasPii: boolean;
  entities: PiiEntity[];
  redactedText?: string;
}

export interface PiiApiResponse {
  blocked: boolean;
  message: string | null;
  detectedCategories?: string[];
  warning?: string;
}
