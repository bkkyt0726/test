"use client";

import { useRef, useState, useMemo } from "react";
import type {
  BuildAddition,
  BuildPayload,
  ConflictEntry,
  ExtractedBlock,
  ExtractedFeatures,
  FeatureSelection,
  ToggleDefinition,
} from "@/lib/types";

type BlockTarget = { type: "base"; key: string } | { type: "new" };

interface Props {
  selections: FeatureSelection[];
  onRemove: (id: string) => void;
}

export default function IntegrationView({ selections, onRemove }: Props) {
  // 기반 파일
  const baseInputRef = useRef<HTMLInputElement>(null);
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [baseFeatures, setBaseFeatures] = useState<ExtractedFeatures | null>(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);

  // 기반 파일에서 제거할 toggle keys
  const [removalKeys, setRemovalKeys] = useState<string[]>([]);

  // 비-toggle 블록의 삽입 대상 toggle
  const [blockTargets, setBlockTargets] = useState<Record<string, BlockTarget>>({});

  // 충돌 해결
  const [resolutions, setResolutions] = useState<Record<string, "skip" | "add_alongside">>({});

  // 빌드
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // 충돌 감지 (기반 파일 toggle keys vs 선택된 addition toggle keys)
  const conflicts = useMemo(
    () => detectConflicts(baseFeatures, selections),
    [baseFeatures, selections]
  );
  const unresolvedCount = conflicts.filter((c) => !resolutions[c.key]).length;

  async function handleBaseUpload(file: File) {
    if (!file.name.endsWith(".risup")) {
      setBaseError(".risup 파일만 가능합니다");
      return;
    }
    setBaseFile(file);
    setBaseLoading(true);
    setBaseError(null);
    setBaseFeatures(null);
    setResolutions({});
    setRemovalKeys([]);
    setBlockTargets({});
    try {
      const form = new FormData();
      form.append("files", file);
      const res = await fetch("/api/analyze/features", { method: "POST", body: form });
      const text = await res.text();
      if (!res.ok) {
        let detail = `오류 ${res.status}`;
        try { detail = (JSON.parse(text) as { detail?: string }).detail ?? detail; } catch { /* plain text */ }
        setBaseError(detail);
        return;
      }
      const data = JSON.parse(text) as { ok: boolean; files: ExtractedFeatures[] };
      if (!data.files?.[0]) {
        setBaseError("파싱 실패");
        return;
      }
      setBaseFeatures(data.files[0]);
    } catch (e) {
      setBaseError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setBaseLoading(false);
    }
  }

  function resolve(key: string, value: "skip" | "add_alongside") {
    setResolutions((prev) => ({ ...prev, [key]: value }));
  }

  async function handleBuild() {
    if (!baseFile || selections.length === 0) return;
    setBuildLoading(true);
    setBuildError(null);

    // 미결 충돌 → 기본값 "skip"
    const finalResolutions: Record<string, "skip" | "add_alongside"> = {};
    for (const c of conflicts) {
      finalResolutions[c.key] = resolutions[c.key] ?? "skip";
    }

    const additions = buildAdditions(selections, blockTargets);
    const payload: BuildPayload = { additions, conflict_resolutions: finalResolutions, removals: removalKeys };

    try {
      const form = new FormData();
      form.append("base_file", baseFile);
      form.append("payload", new Blob([JSON.stringify(payload)], { type: "application/json" }), "payload.json");
      const res = await fetch("/api/integrate/build", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text();
        let detail = `오류 ${res.status}`;
        try { detail = (JSON.parse(text) as { detail?: string }).detail ?? detail; } catch { /* plain text */ }
        setBuildError(detail);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const rfc5987 = cd.match(/filename\*=UTF-8''([^;]+)/i);
      const plain = cd.match(/filename="([^"]+)"/);
      const filename = rfc5987 ? decodeURIComponent(rfc5987[1]) : (plain?.[1] ?? "merged.risup");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setBuildLoading(false);
    }
  }

  if (selections.length === 0) {
    return (
      <div className="integration-empty">
        <p>기능 추출 탭에서 Toggle을 선택하고 저장하세요.</p>
      </div>
    );
  }

  return (
    <div className="integration-root">

      {/* ① 기반 프롬프트 */}
      <section className="result-section">
        <h3 className="result-section-title">① 기반 프롬프트</h3>
        <p className="desc">선택한 기능이 추가될 기준 .risup 파일을 업로드하세요.</p>

        <input
          ref={baseInputRef}
          type="file"
          accept=".risup"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleBaseUpload(f);
            e.target.value = "";
          }}
        />

        {!baseFeatures ? (
          <button
            className="extract-btn"
            onClick={() => baseInputRef.current?.click()}
            disabled={baseLoading}
          >
            {baseLoading ? "분석 중..." : "기반 파일 업로드"}
          </button>
        ) : (
          <div className="base-info">
            <div className="base-info-row">
              <span className="block-name">{baseFeatures.metadata.name || baseFeatures.filename}</span>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <span className="badge">
                  Toggle {baseFeatures.toggle_definitions?.length ?? 0}개
                </span>
                <span className="badge">{baseFeatures.summary.total_blocks}블록</span>
                <button
                  className="sel-btn"
                  onClick={() => {
                    setBaseFile(null);
                    setBaseFeatures(null);
                    setResolutions({});
                    setRemovalKeys([]);
                    setBlockTargets({});
                  }}
                >
                  변경
                </button>
              </div>
            </div>
            <span className="block-meta">{baseFeatures.filename}</span>
          </div>
        )}
        {baseError && <p className="error" style={{ marginTop: "0.5rem" }}>{baseError}</p>}
      </section>

      {/* ② 제거할 기능 */}
      {baseFeatures && (baseFeatures.toggle_definitions?.length ?? 0) > 0 && (
        <section className="result-section">
          <h3 className="result-section-title">
            ② 제거할 기능
            {removalKeys.length > 0 && (
              <span className="conflict-badge">{removalKeys.length}개 선택</span>
            )}
          </h3>
          <p className="desc">기반 프롬프트에서 제거할 Toggle을 선택하세요.</p>
          <div className="toggle-view">
            {(baseFeatures.toggle_definitions ?? []).map((t) => {
              const isSelected = removalKeys.includes(t.key);
              const blockCount = baseFeatures.prompt_blocks.filter((b) =>
                (b.toggle_refs ?? []).includes(t.key)
              ).length;
              return (
                <div
                  key={t.key}
                  className={`toggle-item removal-item${isSelected ? " removal-selected" : ""}`}
                  onClick={() =>
                    setRemovalKeys((prev) =>
                      prev.includes(t.key) ? prev.filter((k) => k !== t.key) : [...prev, t.key]
                    )
                  }
                >
                  <div className="toggle-item-header">
                    <span className="toggle-item-label">{t.label}</span>
                    <div className="toggle-item-meta">
                      <span className="feature-count">{blockCount}블록</span>
                      <span className={`badge${isSelected ? " badge-removal" : ""}`}>
                        {isSelected ? "제거" : "유지"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {removalKeys.length > 0 && (
            <button className="sel-btn" style={{ marginTop: "0.5rem" }} onClick={() => setRemovalKeys([])}>
              전체 취소
            </button>
          )}
        </section>
      )}

      {/* ③ 추가할 기능 */}
      <section className="result-section">
        <h3 className="result-section-title">③ 추가할 기능</h3>
        <div className="block-list">
          {selections.map((sel) => (
            <SelectionCard
              key={sel.id}
              sel={sel}
              onRemove={onRemove}
              baseToggles={baseFeatures?.toggle_definitions ?? []}
              blockTarget={blockTargets[sel.id]}
              onTargetChange={(t) => setBlockTargets((prev) => ({ ...prev, [sel.id]: t }))}
            />
          ))}
        </div>
      </section>

      {/* ③ 충돌 확인 */}
      {baseFeatures && conflicts.length > 0 && (
        <section className="result-section">
          <h3 className="result-section-title">
            ④ 충돌 확인
            {unresolvedCount > 0 && (
              <span className="conflict-badge">{unresolvedCount}개 미결</span>
            )}
          </h3>
          <p className="desc">
            기반 파일에 이미 존재하는 Toggle입니다. 처리 방식을 선택하세요.
          </p>
          <div className="block-list">
            {conflicts.map((c) => (
              <ConflictCard
                key={c.key}
                conflict={c}
                resolution={resolutions[c.key] ?? null}
                onResolve={(v) => resolve(c.key, v)}
              />
            ))}
          </div>
          <div className="conflict-bulk-btns">
            <button
              className="sel-btn"
              onClick={() => {
                const r: Record<string, "skip" | "add_alongside"> = {};
                for (const c of conflicts) r[c.key] = "skip";
                setResolutions((prev) => ({ ...prev, ...r }));
              }}
            >
              전체 건너뜀
            </button>
            <button
              className="sel-btn"
              onClick={() => {
                const r: Record<string, "skip" | "add_alongside"> = {};
                for (const c of conflicts) r[c.key] = "add_alongside";
                setResolutions((prev) => ({ ...prev, ...r }));
              }}
            >
              전체 함께 추가
            </button>
          </div>
        </section>
      )}

      {/* 미리보기 */}
      {baseFeatures && (
        <MergePreview
          selections={selections}
          resolutions={resolutions}
          conflicts={conflicts}
          blockTargets={blockTargets}
          baseToggles={baseFeatures.toggle_definitions ?? []}
          removalKeys={removalKeys}
        />
      )}

      {/* 빌드 */}
      {buildError && <div className="error">{buildError}</div>}
      <button
        className="merge-btn"
        onClick={handleBuild}
        disabled={!baseFile || selections.length === 0 || buildLoading}
      >
        {buildLoading ? "생성 중..." : "통합 파일 생성 (.risup 다운로드)"}
      </button>
    </div>
  );
}

// ── 저장된 선택 카드 ──────────────────────────
function SelectionCard({
  sel,
  onRemove,
  baseToggles,
  blockTarget,
  onTargetChange,
}: {
  sel: FeatureSelection;
  onRemove: (id: string) => void;
  baseToggles: ToggleDefinition[];
  blockTarget: BlockTarget | undefined;
  onTargetChange: (t: BlockTarget) => void;
}) {
  const count = sel.features.has_toggles
    ? sel.selected_toggle_keys.length
    : sel.selected_block_ids.length;
  const unit = sel.features.has_toggles ? "Toggle" : "블록";

  return (
    <div className="block-card">
      <div className="block-header">
        <div>
          <span className="block-name">{sel.preset_name}</span>
          <span className="block-meta" style={{ display: "block", marginTop: "0.1rem" }}>
            {sel.filename}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="badge">{count}개 {unit}</span>
          <button className="file-item-remove" onClick={() => onRemove(sel.id)}>✕</button>
        </div>
      </div>
      {sel.selected_toggle_keys.length > 0 && (
        <div className="sel-tag-list">
          {sel.selected_toggle_keys.slice(0, 10).map((key) => {
            const def = sel.features.toggle_definitions?.find((t) => t.key === key);
            return <span key={key} className="sel-tag">{def?.label ?? key}</span>;
          })}
          {sel.selected_toggle_keys.length > 10 && (
            <span className="sel-tag sel-tag-more">+{sel.selected_toggle_keys.length - 10}</span>
          )}
        </div>
      )}
      {!sel.features.has_toggles && sel.selected_block_ids.length > 0 && baseToggles.length > 0 && (
        <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="block-meta">삽입할 Toggle:</span>
          <select
            className="toggle-target-select"
            value={blockTarget?.type === "base" ? blockTarget.key : "_new"}
            onChange={(e) => {
              const v = e.target.value;
              onTargetChange(v === "_new" ? { type: "new" } : { type: "base", key: v });
            }}
          >
            <option value="_new">새 Toggle 생성</option>
            {baseToggles.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ── 충돌 카드 ─────────────────────────────────
function ConflictCard({
  conflict, resolution, onResolve,
}: {
  conflict: ConflictEntry;
  resolution: "skip" | "add_alongside" | null;
  onResolve: (v: "skip" | "add_alongside") => void;
}) {
  return (
    <div className={`block-card conflict-card ${
      resolution === "skip" ? "conflict-skip" :
      resolution === "add_alongside" ? "conflict-alongside" :
      "conflict-pending"
    }`}>
      <div className="block-header">
        <div>
          <span className="block-name">{conflict.label}</span>
          <span className="block-meta" style={{ display: "block", marginTop: "0.1rem" }}>
            기반: {conflict.base_label} &nbsp;/&nbsp; 추가: {conflict.addition_label}
            <span style={{ color: "#555", marginLeft: "0.4rem" }}>
              ({shortFilename(conflict.addition_source)})
            </span>
          </span>
        </div>
        <span className="block-meta">
          {resolution === "skip" && "건너뜀"}
          {resolution === "add_alongside" && "함께 추가"}
          {!resolution && <span style={{ color: "#e8a050" }}>⚠ 미결</span>}
        </span>
      </div>
      <div className="conflict-options">
        <button
          className={`conflict-opt-btn ${resolution === "skip" ? "conflict-opt-active" : ""}`}
          onClick={() => onResolve("skip")}
        >
          건너뜀 (기존 유지)
        </button>
        <button
          className={`conflict-opt-btn ${resolution === "add_alongside" ? "conflict-opt-active conflict-opt-add" : ""}`}
          onClick={() => onResolve("add_alongside")}
        >
          함께 추가
        </button>
      </div>
    </div>
  );
}

// ── 병합 미리보기 ─────────────────────────────
function MergePreview({
  selections, resolutions, conflicts, blockTargets, baseToggles, removalKeys,
}: {
  selections: FeatureSelection[];
  resolutions: Record<string, "skip" | "add_alongside">;
  conflicts: ConflictEntry[];
  blockTargets: Record<string, BlockTarget>;
  baseToggles: ToggleDefinition[];
  removalKeys: string[];
}) {
  const [open, setOpen] = useState(false);
  const conflictKeys = new Set(conflicts.map((c) => c.key));
  const baseToggleMap = new Map(baseToggles.map((t) => [t.key, t]));

  // 실제로 추가될 toggle 목록
  const toAdd: { sel: FeatureSelection; def: ToggleDefinition; blocks: ExtractedBlock[] }[] = [];
  for (const sel of selections) {
    for (const key of sel.selected_toggle_keys) {
      if (conflictKeys.has(key)) {
        const res = resolutions[key] ?? "skip";
        if (res === "skip") continue;
      }
      const def = sel.features.toggle_definitions?.find((t) => t.key === key);
      if (!def) continue;
      const blocks = sel.features.prompt_blocks.filter((b) =>
        (b.toggle_refs ?? []).includes(key)
      );
      toAdd.push({ sel, def, blocks });
    }
  }

  // 비-toggle 블록 삽입 목록
  const blockInsertions: { sel: FeatureSelection; targetLabel: string; blocks: ExtractedBlock[] }[] = [];
  for (const sel of selections) {
    if (!sel.features.has_toggles && sel.selected_block_ids.length > 0) {
      const selectedBlocks = sel.features.prompt_blocks.filter((b) =>
        sel.selected_block_ids.includes(b.id)
      );
      if (selectedBlocks.length === 0) continue;
      const target = blockTargets[sel.id];
      const targetLabel =
        target?.type === "base"
          ? (baseToggleMap.get(target.key)?.label ?? target.key)
          : `새 Toggle (${sel.preset_name})`;
      blockInsertions.push({ sel, targetLabel, blocks: selectedBlocks });
    }
  }

  const skipped = conflicts.filter((c) => (resolutions[c.key] ?? "skip") === "skip").length;

  return (
    <section className="result-section">
      <div
        className="file-card-header"
        onClick={() => setOpen((v) => !v)}
        style={{ cursor: "pointer" }}
      >
        <h3 className="result-section-title" style={{ marginBottom: 0 }}>
          미리보기
        </h3>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {toAdd.length > 0 && <span className="badge badge-toggle">추가 {toAdd.length}개</span>}
          {blockInsertions.length > 0 && <span className="badge badge-toggle">삽입 {blockInsertions.length}개</span>}
          {removalKeys.length > 0 && <span className="badge badge-removal">제거 {removalKeys.length}개</span>}
          {skipped > 0 && <span className="badge">{skipped}개 건너뜀</span>}
          <span className="collapse-icon">{open ? "▲" : "▼"}</span>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: "0.75rem" }}>
          <div className="toggle-view">
            {toAdd.map(({ def, sel, blocks }) => (
              <PreviewToggleItem
                key={`${sel.filename}-${def.key}`}
                def={def}
                source={sel.filename}
                blocks={blocks}
              />
            ))}
            {blockInsertions.map(({ sel, targetLabel, blocks }) => (
              <PreviewBlockInsertion
                key={sel.id}
                source={sel.filename}
                targetLabel={targetLabel}
                blocks={blocks}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PreviewToggleItem({
  def, source, blocks,
}: {
  def: ToggleDefinition;
  source: string;
  blocks: ExtractedBlock[];
}) {
  const [open, setOpen] = useState(false);
  const chars = blocks.reduce((s, b) => s + b.char_count, 0);
  return (
    <div className="toggle-item">
      <div className="toggle-item-header" onClick={() => setOpen((v) => !v)}>
        <span className="toggle-item-label">{def.label}</span>
        <div className="toggle-item-meta">
          <span style={{ fontSize: "0.7rem", color: "#555" }}>{shortFilename(source)}</span>
          <span className="feature-count">
            {blocks.length}블록 · {chars.toLocaleString()}자 {open ? "▲" : "▼"}
          </span>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0.4rem" }}>
          {blocks.map((b) => (
            <BlockPreviewItem key={`${b.source_file}-${b.id}`} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewBlockInsertion({
  source, targetLabel, blocks,
}: {
  source: string;
  targetLabel: string;
  blocks: ExtractedBlock[];
}) {
  const [open, setOpen] = useState(false);
  const chars = blocks.reduce((s, b) => s + b.char_count, 0);
  return (
    <div className="toggle-item">
      <div className="toggle-item-header" onClick={() => setOpen((v) => !v)}>
        <span className="toggle-item-label">
          {targetLabel}
          <span style={{ fontSize: "0.7rem", color: "#888", marginLeft: "0.4rem" }}>에 삽입</span>
        </span>
        <div className="toggle-item-meta">
          <span style={{ fontSize: "0.7rem", color: "#555" }}>{shortFilename(source)}</span>
          <span className="feature-count">
            {blocks.length}블록 · {chars.toLocaleString()}자 {open ? "▲" : "▼"}
          </span>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0.4rem" }}>
          {blocks.map((b) => (
            <BlockPreviewItem key={`${b.source_file}-${b.id}`} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockPreviewItem({ block }: { block: ExtractedBlock }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`block-card block-list-compact ${block.char_count === 0 ? "disabled" : ""}`}>
      <div
        className="block-header"
        onClick={() => block.char_count > 0 && setOpen((v) => !v)}
        style={{ cursor: block.char_count > 0 ? "pointer" : "default" }}
      >
        <span className="block-name">{block.name || `(블록 ${block.id})`}</span>
        <span className="block-meta">
          {block.role} · {block.char_count.toLocaleString()}자
          {block.char_count > 0 && <span className="expand-hint">{open ? " ▲" : " ▼"}</span>}
        </span>
      </div>
      {open && <pre className="block-content">{block.content}</pre>}
    </div>
  );
}

// ── 로직 ─────────────────────────────────────
function detectConflicts(
  baseFeatures: ExtractedFeatures | null,
  selections: FeatureSelection[]
): ConflictEntry[] {
  if (!baseFeatures?.toggle_definitions) return [];
  const baseDefs = new Map(baseFeatures.toggle_definitions.map((t) => [t.key, t]));
  const result: ConflictEntry[] = [];
  const seen = new Set<string>();

  for (const sel of selections) {
    for (const key of sel.selected_toggle_keys) {
      if (baseDefs.has(key) && !seen.has(key)) {
        seen.add(key);
        const baseDef = baseDefs.get(key)!;
        const addDef = sel.features.toggle_definitions?.find((t) => t.key === key);
        result.push({
          key,
          label: baseDef.label,
          base_label: baseDef.label,
          addition_label: addDef?.label ?? key,
          addition_source: sel.filename,
          resolved_to: null,
        });
      }
    }
  }
  return result;
}

function buildAdditions(
  selections: FeatureSelection[],
  blockTargets: Record<string, BlockTarget>,
): BuildAddition[] {
  const additions: BuildAddition[] = [];
  for (const sel of selections) {
    for (const key of sel.selected_toggle_keys) {
      const def = sel.features.toggle_definitions?.find((t) => t.key === key);
      if (!def) continue;
      const blocks = sel.features.prompt_blocks.filter((b) =>
        (b.toggle_refs ?? []).includes(key)
      );
      additions.push({
        source_filename: sel.filename,
        toggle_key: key,
        toggle_label: def.label,
        toggle_def_line: buildToggleDefLine(def),
        blocks: blocks.map((b) => ({
          name: b.name,
          content: b.content,
          role: b.role,
          type2: b.type2,
          enabled: b.enabled,
        })),
      });
    }
    // toggle 없는 파일: 선택된 블록 직접 추가
    if (!sel.features.has_toggles && sel.selected_block_ids.length > 0) {
      const selectedBlocks = sel.features.prompt_blocks.filter((b) =>
        sel.selected_block_ids.includes(b.id)
      );
      if (selectedBlocks.length === 0) continue;
      const target = blockTargets[sel.id];
      if (target?.type === "base") {
        // 기존 base toggle에 삽입 — 새 toggle def 생성 안 함
        additions.push({
          source_filename: sel.filename,
          toggle_key: target.key,
          toggle_label: sel.preset_name,
          toggle_def_line: null,
          blocks: selectedBlocks.map((b) => ({
            name: b.name,
            content: b.content,
            role: b.role,
            type2: b.type2,
            enabled: b.enabled,
          })),
        });
      } else {
        // 새 toggle 생성 (기본값)
        additions.push({
          source_filename: sel.filename,
          toggle_key: `_base_${sel.filename}`,
          toggle_label: `기본 블록 (${sel.preset_name})`,
          toggle_def_line: `_base_${sel.filename}=기본 블록 (${sel.preset_name})`,
          blocks: selectedBlocks.map((b) => ({
            name: b.name,
            content: b.content,
            role: b.role,
            type2: b.type2,
            enabled: b.enabled,
          })),
        });
      }
    }
  }
  return additions;
}

function buildToggleDefLine(def: ToggleDefinition): string {
  if (def.type === "text") return `${def.key}=${def.label}=text`;
  if (def.type === "select" && def.options?.length) {
    return `${def.key}=${def.label}=select=${def.options.join(",")}`;
  }
  return `${def.key}=${def.label}`;
}

function shortFilename(filename: string): string {
  return filename.length > 30 ? "..." + filename.slice(-27) : filename;
}
