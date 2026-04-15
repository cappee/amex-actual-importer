// ---------------------------------------------------------------------------
// Types for interaction with Actual Budget (@actual-app/api)
// ---------------------------------------------------------------------------

/** Transaction in the format expected by Actual Budget for import */
export interface ActualTransaction {
  date: string;
  payee_name: string;
  amount: number;
  imported_id: string;
  notes?: string;
}

/** Result of an import operation */
export interface ImportResult {
  imported: number;
  skipped: number;
}