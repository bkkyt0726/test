"use client";

import { useState } from "react";
import type {
  BlockCategory,
  ExtractedBlock,
  ExtractedFeatures,
  FeatureSelection,
  MultiFileFeatures,
  RegexRule,
  ToggleDefinition,
  TokenBias,
} from "@/lib/types";

const CATEGORY_LABEL: Record<BlockCategory, string> = {
  main: "메인", global_note: "글로벌 노트", author_note: "저자 노트",
  system: "시스템", user: "유저", bot: "봇", all: "공통",
};
const CATEGORY_ORDER: BlockCategory[] = [
  "main", "global_note", "author_note", "system", "user", "bot", "all",
];

interface Props {
  result: MultiFileFeatures;
  onSave: (sel: FeatureSelection) => void;
  savedIds: Set<string>;
}

export default function FeatureExtraction({ result, onSave, savedIds }: Props) {
  return (
    <div className="feature-result">
      <div className="feature-overview">
        <span className="badge">{result.files.length}개 파일</span>
        <span className="badge">
          {result.files.reduce((s, f) => s + f.summary.total_blocks, 0)}개 블록
        </span>
        <span className="badge">
          {result.files.reduce((s, f) => s + f.summary.total_chars, 0).toLocaleString()}자
        </span>
      </div>
      <div className="feature-files">
        {result.files.map((file) => (
          <FileFeatureCard
            key={file.filename}
            file={file}
            onSave={onSave}
            isSaved={savedIds.has(file.filename)}
          />
        ))}
      </div>
    </div>
  );
}

// ── 파일 카드 ────────────────────────────────
function FileFeatureCard({
  file, onSave, isSaved,
}: {
  file: ExtractedFeatures;
  onSave: (sel: FeatureSelection) => void;
  isSaved: boolean;
}) {
  const [open, setOpen] = useState(true);
  const hasGenParams = Object.keys(file.gen_params).length > 0;

  // 선택 상태
  const allToggleKeys = (file.toggle_definitions ?? []).map((t) => t.key);
  const [selectedToggles, setSelectedToggles] = useState<Set<string>>(new Set());
  const allBlockIds = file.prompt_blocks.map((b) => b.id);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());

  const selectionCount = file.has_toggles ? selectedToggles.size : selectedBlocks.size;

  function toggleKey(key: string) {
    setSelectedToggles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }
  function toggleBlock(id: string) {
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }
  function selectAll() {
    if (file.has_toggles) setSelectedToggles(new Set(allToggleKeys));
    else setSelectedBlocks(new Set(allBlockIds));
  }
  function clearAll() {
    if (file.has_toggles) setSelectedToggles(new Set());
    else setSelectedBlocks(new Set());
  }

  function handleSave() {
    onSave({
      id: file.filename,
      filename: file.filename,
      preset_name: file.metadata.name || file.filename,
      selected_toggle_keys: Array.from(selectedToggles),
      selected_block_ids: Array.from(selectedBlocks),
      features: file,
    });
  }

  return (
    <div className="result-section">
      <div className="file-card-header" onClick={() => setOpen((v) => !v)}>
        <div>
          <span className="file-card-name">{file.metadata.name || file.filename}</span>
          <span className="file-card-sub">{file.filename}</span>
        </div>
        <div className="file-card-badges">
          {file.has_toggles && (
            <span className="badge badge-toggle">Toggle {file.toggle_definitions?.length}개</span>
          )}
          <span className="badge">{file.summary.total_blocks}블록</span>
          <span className="badge">{file.summary.total_chars.toLocaleString()}자</span>
          {file.summary.regex_count > 0 && (
            <span className="badge">정규식 {file.summary.regex_count}</span>
          )}
          {file.summary.bias_count > 0 && (
            <span className="badge">바이어스 {file.summary.bias_count}</span>
          )}
          <span className="collapse-icon">{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div className="file-card-body">
          {hasGenParams && (
            <GenParamsSection params={file.gen_params as Record<string, number>} />
          )}

          {file.has_toggles && file.toggle_definitions ? (
            <ToggleView
              toggleDefs={file.toggle_definitions}
              blocks={file.prompt_blocks}
              activeIndices={file.active_toggle_indices ?? []}
              selectedKeys={selectedToggles}
              onToggleKey={toggleKey}
            />
          ) : (
            <CategoryView
              blocks={file.prompt_blocks}
              selectedIds={selectedBlocks}
              onToggleBlock={toggleBlock}
            />
          )}

          {file.regex_rules.length > 0 && <RegexSection rules={file.regex_rules} />}
          {file.token_biases.length > 0 && <BiasSection biases={file.token_biases} />}

          {/* 저장 바 */}
          <div className="save-bar">
            <div className="save-bar-left">
              <button className="sel-btn" onClick={selectAll}>전체 선택</button>
              <button className="sel-btn" onClick={clearAll}>전체 해제</button>
              <span className="sel-count">
                {selectionCount > 0 ? `${selectionCount}개 선택됨` : "선택 없음"}
              </span>
            </div>
            <button
              className={`save-btn ${isSaved ? "save-btn-updated" : ""}`}
              onClick={handleSave}
              disabled={selectionCount === 0}
            >
              {isSaved ? "선택 업데이트" : "선택 저장 →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toggle 기반 뷰 ───────────────────────────
function ToggleView({
  toggleDefs, blocks, activeIndices, selectedKeys, onToggleKey,
}: {
  toggleDefs: ToggleDefinition[];
  blocks: ExtractedBlock[];
  activeIndices: number[];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
}) {
  const blocksByToggle = new Map<string, ExtractedBlock[]>();
  for (const block of blocks) {
    for (const key of block.toggle_refs ?? []) {
      if (!blocksByToggle.has(key)) blocksByToggle.set(key, []);
      blocksByToggle.get(key)!.push(block);
    }
  }
  const baseBlocks = blocks.filter((b) => !b.toggle_refs || b.toggle_refs.length === 0);

  const groups = new Map<string, (ToggleDefinition & { _idx: number })[]>();
  for (const [idx, t] of toggleDefs.entries()) {
    const g = t.group ?? "(기타)";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ ...t, _idx: idx });
  }

  return (
    <div className="toggle-view">
      {Array.from(groups.entries()).map(([groupName, groupToggles]) => (
        <ToggleGroup
          key={groupName}
          groupName={groupName}
          toggles={groupToggles}
          blocksByToggle={blocksByToggle}
          activeIndices={activeIndices}
          selectedKeys={selectedKeys}
          onToggleKey={onToggleKey}
        />
      ))}
      {baseBlocks.length > 0 && (
        <div className="feature-subsection">
          <h4 className="feature-subsection-title">
            기본 블록 (Toggle 미참조)
            <span className="feature-count">{baseBlocks.length}</span>
          </h4>
          <BlockList blocks={baseBlocks} />
        </div>
      )}
    </div>
  );
}

function ToggleGroup({
  groupName, toggles, blocksByToggle, activeIndices, selectedKeys, onToggleKey,
}: {
  groupName: string;
  toggles: (ToggleDefinition & { _idx: number })[];
  blocksByToggle: Map<string, ExtractedBlock[]>;
  activeIndices: number[];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedCount = toggles.filter((t) => selectedKeys.has(t.key)).length;

  return (
    <div className="toggle-group">
      <div className="toggle-group-header" onClick={() => setOpen((v) => !v)}>
        <span className="toggle-group-name">{groupName}</span>
        <span className="feature-count">
          {selectedCount > 0 && <span className="sel-badge">{selectedCount}선택 · </span>}
          {toggles.length}개
        </span>
        <span className="collapse-icon">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="toggle-group-body">
          {toggles.map((t) => (
            <ToggleItem
              key={t.key}
              toggle={t}
              blocks={blocksByToggle.get(t.key) ?? []}
              isActive={activeIndices.includes(t._idx)}
              isSelected={selectedKeys.has(t.key)}
              onSelect={() => onToggleKey(t.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleItem({
  toggle, blocks, isActive, isSelected, onSelect,
}: {
  toggle: ToggleDefinition;
  blocks: ExtractedBlock[];
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`toggle-item ${isActive ? "toggle-active" : ""} ${isSelected ? "toggle-selected" : ""}`}>
      <div className="toggle-item-header">
        <input
          type="checkbox"
          className="sel-checkbox"
          checked={isSelected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
        />
        <span
          className="toggle-item-label"
          onClick={() => blocks.length > 0 && setOpen((v) => !v)}
          style={{ cursor: blocks.length > 0 ? "pointer" : "default", flex: 1 }}
        >
          {toggle.label}
        </span>
        <div className="toggle-item-meta">
          {toggle.type !== "toggle" && (
            <span className="toggle-type-badge">{toggle.type}</span>
          )}
          {isActive && <span className="toggle-active-badge">ON</span>}
          {blocks.length > 0 ? (
            <span
              className="feature-count"
              onClick={() => setOpen((v) => !v)}
              style={{ cursor: "pointer" }}
            >
              {blocks.length}블록 {open ? "▲" : "▼"}
            </span>
          ) : (
            <span className="feature-count empty-count">블록 없음</span>
          )}
        </div>
      </div>
      {open && <BlockList blocks={blocks} compact />}
    </div>
  );
}

// ── Category 기반 뷰 ─────────────────────────
function CategoryView({
  blocks, selectedIds, onToggleBlock,
}: {
  blocks: ExtractedBlock[];
  selectedIds: Set<string>;
  onToggleBlock: (id: string) => void;
}) {
  const byCategory = groupByCategory(blocks);
  return (
    <div>
      {CATEGORY_ORDER.map((cat) => {
        const catBlocks = byCategory[cat];
        if (!catBlocks || catBlocks.length === 0) return null;
        return (
          <div key={cat} className="feature-subsection">
            <h4 className="feature-subsection-title">
              {CATEGORY_LABEL[cat]}
              <span className="feature-count">
                {catBlocks.filter((b) => b.char_count > 0).length}/{catBlocks.length}
              </span>
            </h4>
            <BlockList
              blocks={catBlocks}
              selectedIds={selectedIds}
              onToggleBlock={onToggleBlock}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── 블록 목록 ────────────────────────────────
function BlockList({
  blocks, compact, selectedIds, onToggleBlock,
}: {
  blocks: ExtractedBlock[];
  compact?: boolean;
  selectedIds?: Set<string>;
  onToggleBlock?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className={`block-list ${compact ? "block-list-compact" : ""}`}>
      {blocks.map((block) => {
        const key = `${block.source_file}-${block.id}`;
        const isSelected = selectedIds?.has(block.id);
        return (
          <div
            key={key}
            className={`block-card feature-block ${block.char_count === 0 ? "disabled" : ""} ${
              expanded === key ? "expanded" : ""
            } ${isSelected ? "block-selected" : ""}`}
          >
            <div className="block-header">
              {onToggleBlock && (
                <input
                  type="checkbox"
                  className="sel-checkbox"
                  checked={!!isSelected}
                  onChange={() => onToggleBlock(block.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <span
                className="block-name"
                onClick={() => block.char_count > 0 && setExpanded(expanded === key ? null : key)}
                style={{ cursor: block.char_count > 0 ? "pointer" : "default", flex: 1 }}
              >
                {block.name || `(블록 ${block.id})`}
              </span>
              <span
                className="block-meta"
                onClick={() => block.char_count > 0 && setExpanded(expanded === key ? null : key)}
                style={{ cursor: block.char_count > 0 ? "pointer" : "default" }}
              >
                {block.role} · {block.char_count.toLocaleString()}자
                {block.char_count > 0 && (
                  <span className="expand-hint">{expanded === key ? " ▲" : " ▼"}</span>
                )}
              </span>
            </div>
            {expanded === key && (
              <pre className="block-content">{block.content}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 공통 섹션 ────────────────────────────────
function GenParamsSection({ params }: { params: Record<string, number> }) {
  return (
    <div className="feature-subsection">
      <h4 className="feature-subsection-title">생성 파라미터</h4>
      <table className="param-table">
        <tbody>
          {Object.entries(params).map(([k, v]) => (
            <tr key={k}><td className="param-key">{k}</td><td>{String(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegexSection({ rules }: { rules: RegexRule[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="feature-subsection">
      <h4 className="feature-subsection-title clickable" onClick={() => setOpen((v) => !v)}>
        정규식 규칙
        <span className="feature-count">{rules.filter((r) => r.enabled).length}/{rules.length}</span>
        <span className="collapse-icon">{open ? "▲" : "▼"}</span>
      </h4>
      {open && (
        <div className="block-list">
          {rules.map((r, i) => (
            <div key={i} className={`block-card ${r.enabled ? "" : "disabled"}`}>
              <div className="block-header">
                <span className="block-name">{r.comment || `(규칙 ${i + 1})`}</span>
                <span className="block-meta">{r.type}</span>
              </div>
              <p className="block-preview">{r.pattern_in} → {r.pattern_out}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BiasSection({ biases }: { biases: TokenBias[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...biases].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return (
    <div className="feature-subsection">
      <h4 className="feature-subsection-title clickable" onClick={() => setOpen((v) => !v)}>
        토큰 바이어스
        <span className="feature-count">{biases.length}개</span>
        <span className="collapse-icon">{open ? "▲" : "▼"}</span>
      </h4>
      {open && (
        <div className="bias-grid">
          {sorted.map((b, i) => (
            <span key={i} className={`bias-chip ${b.weight > 0 ? "bias-pos" : "bias-neg"}`}>
              {b.token} {b.weight > 0 ? "+" : ""}{b.weight}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 유틸 ─────────────────────────────────────
function groupByCategory(blocks: ExtractedBlock[]): Partial<Record<BlockCategory, ExtractedBlock[]>> {
  const result: Partial<Record<BlockCategory, ExtractedBlock[]>> = {};
  for (const block of blocks) {
    if (!result[block.category]) result[block.category] = [];
    result[block.category]!.push(block);
  }
  return result;
}
