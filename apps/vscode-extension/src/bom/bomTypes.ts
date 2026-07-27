export interface BomEntry {
  references: string[];
  value: string;
  footprint: string;
  quantity: number;
  mpn: string;
  manufacturer: string;
  lcsc: string;
  description: string;
  dnp: boolean;
  uuid?: string | undefined;
}

export interface BomSummary {
  totalComponents: number;
  uniqueValues: number;
}

export interface BomWebviewMessage {
  type:
    | 'setData'
    | 'setStatus'
    | 'highlight'
    | 'exportCsv'
    | 'exportXlsx'
    | 'rowSelected';
  payload?: Record<string, unknown>;
}
