export interface PromptBlock {
  id: string;
  name: string;
  content: string;
  role: string;
  enabled: boolean;
  source: string;
}

// 기능 추출 (1-2)
export type BlockCategory =
  | "main"
  | "global_note"
  | "author_note"
  | "system"
  | "user"
  | "bot"
  | "all";

export interface ExtractedBlock {
  id: string;
  name: string;
  content: string;
  role: string;
  type2: string;
  category: BlockCategory;
  enabled: boolean;
  source_file: string;
  char_count: number;
  toggle_refs?: string[];  // 이 블록이 참조하는 toggle key 목록 (toggle 있는 경우)
}

export type ToggleType = "toggle" | "select" | "text";

export interface ToggleDefinition {
  key: string;
  label: string;
  type: ToggleType;
  group: string | null;
  options?: string[];
}

export interface RegexRule {
  comment: string;
  pattern_in: string;
  pattern_out: string;
  type: string;
  enabled: boolean;
}

export interface TokenBias {
  token: string;
  weight: number;
}

export interface FeatureSummary {
  total_blocks: number;
  enabled_blocks: number;
  total_chars: number;
  regex_count: number;
  bias_count: number;
}

export interface ExtractedFeatures {
  filename: string;
  metadata: AnalysisMeta;
  gen_params: GenParams;
  has_toggles: boolean;
  toggle_definitions?: ToggleDefinition[];
  active_toggle_indices?: number[];
  prompt_blocks: ExtractedBlock[];
  regex_rules: RegexRule[];
  token_biases: TokenBias[];
  formatting_order: string[];
  summary: FeatureSummary;
}

export interface MultiFileFeatures {
  ok: boolean;
  files: ExtractedFeatures[];
}

// 1-2 저장 선택
export interface FeatureSelection {
  id: string;              // filename 기반 stable ID
  filename: string;
  preset_name: string;
  selected_toggle_keys: string[];   // toggle 기반 파일: 선택된 toggle key 목록
  selected_block_ids: string[];     // category 기반 파일: 선택된 block id 목록
  features: ExtractedFeatures;
}

// 1-3 통합
export interface ConflictEntry {
  key: string;
  label: string;
  base_label: string;        // 기반 파일의 toggle 라벨
  addition_label: string;    // 추가 파일의 toggle 라벨
  addition_source: string;   // 추가 파일명
  resolved_to: "skip" | "add_alongside" | null;
}

export interface MergedBlock {
  block: ExtractedBlock;
  toggle_key: string;
  toggle_label: string;
  source_file: string;
}

export interface IntegrationResult {
  sources: FeatureSelection[];
  conflicts: ConflictEntry[];
  merged_blocks: MergedBlock[];
  gen_params_by_source: Record<string, Record<string, number>>;
}

// /api/integrate/build payload
export interface BuildAddition {
  source_filename: string;
  toggle_key: string;
  toggle_label: string;
  toggle_def_line: string | null;
  blocks: {
    name: string;
    content: string;
    role: string;
    type2: string;
    enabled: boolean;
  }[];
}

export interface BuildPayload {
  additions: BuildAddition[];
  conflict_resolutions: Record<string, "skip" | "add_alongside">;
  removals: string[];
}

export interface GenParams {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  min_p?: number;
  top_a?: number;
  max_context?: number;
  max_response?: number;
}

export interface AnalysisMeta {
  name: string;
  preset_version: number;
  description: string;
}

export interface AnalysisSummary {
  total_blocks: number;
  enabled_blocks: number;
  total_chars: number;
}

export interface AnalysisResult {
  ok: boolean;
  filename: string;
  metadata: AnalysisMeta;
  prompt_blocks: PromptBlock[];
  gen_params: GenParams;
  summary: AnalysisSummary;
}
