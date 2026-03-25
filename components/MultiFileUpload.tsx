"use client";

import { useRef, useState } from "react";
import type { MultiFileFeatures } from "@/lib/types";

interface Props {
  onResult: (result: MultiFileFeatures) => void;
  onError: (message: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export default function MultiFileUpload({ onResult, onError, loading, setLoading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const valid = Array.from(incoming).filter((f) => f.name.endsWith(".risup"));
    const invalid = Array.from(incoming).filter((f) => !f.name.endsWith(".risup"));
    if (invalid.length > 0) {
      onError(`.risup 파일만 업로드 가능합니다 (제외됨: ${invalid.map((f) => f.name).join(", ")})`);
    }
    if (valid.length > 0) {
      setFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...valid.filter((f) => !names.has(f.name))];
      });
    }
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleExtract() {
    if (files.length === 0) return;
    setLoading(true);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/analyze/features", { method: "POST", body: form });
      const data: unknown = await res.json();
      if (!res.ok) {
        const err = data as { detail?: string };
        onError(err.detail ?? `오류 ${res.status}`);
        return;
      }
      onResult(data as MultiFileFeatures);
    } catch (e) {
      onError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="multi-upload">
      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""} ${loading ? "loading" : ""}`}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".risup"
          multiple
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          style={{ display: "none" }}
        />
        <p className="upload-icon">📂</p>
        <p>.risup 파일을 여러 개 드래그하거나 클릭해서 추가</p>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          {files.map((f) => (
            <div key={f.name} className="file-item">
              <span className="file-item-name">{f.name}</span>
              <span className="file-item-size">{(f.size / 1024).toFixed(1)} KB</span>
              <button
                className="file-item-remove"
                onClick={() => removeFile(f.name)}
                disabled={loading}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="extract-btn"
            onClick={handleExtract}
            disabled={loading}
          >
            {loading ? "추출 중..." : `기능 추출 (${files.length}개 파일)`}
          </button>
        </div>
      )}
    </div>
  );
}
