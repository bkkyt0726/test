"use client";

import { useRef, useState } from "react";
import type { AnalysisResult } from "@/lib/types";

interface Props {
  onResult: (result: AnalysisResult) => void;
  onError: (message: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export default function FileUpload({
  onResult,
  onError,
  loading,
  setLoading,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    if (!file.name.endsWith(".risup")) {
      onError(".risup 파일만 업로드 가능합니다");
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/analyze/risup", { method: "POST", body: form });
      const data: unknown = await res.json();

      if (!res.ok) {
        const err = data as { detail?: string };
        onError(err.detail ?? `오류 ${res.status}`);
        return;
      }
      onResult(data as AnalysisResult);
    } catch (e) {
      onError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  return (
    <div
      className={`upload-zone ${dragOver ? "drag-over" : ""} ${loading ? "loading" : ""}`}
      onClick={() => !loading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".risup"
        onChange={handleChange}
        style={{ display: "none" }}
      />
      {loading ? (
        <p>분석 중...</p>
      ) : (
        <>
          <p className="upload-icon">📂</p>
          <p>.risup 파일을 드래그하거나 클릭해서 업로드</p>
        </>
      )}
    </div>
  );
}
