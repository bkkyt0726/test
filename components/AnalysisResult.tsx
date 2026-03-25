import type { AnalysisResult, PromptBlock } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function AnalysisResultView({ result }: Props) {
  const { metadata, prompt_blocks, gen_params, summary } = result;

  return (
    <div className="result">
      <section className="result-section">
        <h2>{metadata.name || result.filename}</h2>
        {metadata.description && <p className="desc">{metadata.description}</p>}
        <div className="badges">
          <span className="badge">v{metadata.preset_version}</span>
          <span className="badge">{summary.total_blocks}개 블록</span>
          <span className="badge">{summary.total_chars.toLocaleString()}자</span>
        </div>
      </section>

      {Object.keys(gen_params).length > 0 && (
        <section className="result-section">
          <h3>생성 파라미터</h3>
          <table className="param-table">
            <tbody>
              {Object.entries(gen_params).map(([k, v]) => (
                <tr key={k}>
                  <td className="param-key">{k}</td>
                  <td>{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="result-section">
        <h3>프롬프트 블록 ({summary.enabled_blocks}/{summary.total_blocks} 활성)</h3>
        <div className="block-list">
          {prompt_blocks.map((block: PromptBlock) => (
            <BlockCard key={block.id} block={block} />
          ))}
          {prompt_blocks.length === 0 && (
            <p className="empty">프롬프트 블록이 없습니다</p>
          )}
        </div>
      </section>
    </div>
  );
}

function BlockCard({ block }: { block: PromptBlock }) {
  const preview = block.content.length > 200
    ? block.content.slice(0, 200) + "…"
    : block.content;

  return (
    <div className={`block-card ${block.enabled ? "" : "disabled"}`}>
      <div className="block-header">
        <span className="block-name">{block.name || block.id || "(이름 없음)"}</span>
        <span className="block-meta">{block.role} · {block.source}</span>
      </div>
      {preview && <p className="block-preview">{preview}</p>}
    </div>
  );
}
