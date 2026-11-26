/** Tool semantics, independent of HTML, report JSON, images or their save endpoints. */
export interface ReviewTextToolState {
  enabled: boolean;
  dirty: boolean;
  saving: boolean;
  error: string;
  hint?: string;
}
export interface ReviewTextTool {
  getState(): ReviewTextToolState;
  save(): Promise<void>;
  discard(): void;
}
export interface ReviewMediaTools {
  editText?: ReviewTextTool;
}
