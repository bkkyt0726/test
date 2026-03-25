"use client";

import { useState } from "react";
import AnalysisResultView from "@/components/AnalysisResult";
import FeatureExtraction from "@/components/FeatureExtraction";
import FileUpload from "@/components/FileUpload";
import IntegrationView from "@/components/IntegrationView";
import MultiFileUpload from "@/components/MultiFileUpload";
import type { AnalysisResult, FeatureSelection, MultiFileFeatures } from "@/lib/types";

type Tab = "analyze" | "features" | "integrate";

export default function Home() {
  const [tab, setTab] = useState<Tab>("analyze");

  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresResult, setFeaturesResult] = useState<MultiFileFeatures | null>(null);
  const [featuresError, setFeaturesError] = useState<string | null>(null);

  // 1-2 → 1-3 공유 상태
  const [savedSelections, setSavedSelections] = useState<FeatureSelection[]>([]);

  function handleSaveSelection(sel: FeatureSelection) {
    setSavedSelections((prev) => {
      const idx = prev.findIndex((s) => s.id === sel.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = sel;
        return next;
      }
      return [...prev, sel];
    });
  }

  function handleRemoveSelection(id: string) {
    setSavedSelections((prev) => prev.filter((s) => s.id !== id));
  }

  const savedIds = new Set(savedSelections.map((s) => s.id));

  return (
    <main className="container">
      <h1 className="title">Preset Analyzer</h1>
      <p className="subtitle">.risup 파일을 분석합니다</p>

      <div className="tabs">
        <button
          className={`tab-btn ${tab === "analyze" ? "active" : ""}`}
          onClick={() => setTab("analyze")}
        >
          분석
        </button>
        <button
          className={`tab-btn ${tab === "features" ? "active" : ""}`}
          onClick={() => setTab("features")}
        >
          기능 추출
        </button>
        <button
          className={`tab-btn ${tab === "integrate" ? "active" : ""}`}
          onClick={() => setTab("integrate")}
        >
          통합
          {savedSelections.length > 0 && (
            <span className="tab-count">{savedSelections.length}</span>
          )}
        </button>
      </div>

      {tab === "analyze" && (
        <>
          <FileUpload
            onResult={(r) => { setAnalyzeError(null); setAnalyzeResult(r); }}
            onError={(msg) => { setAnalyzeError(msg); setAnalyzeResult(null); }}
            loading={analyzeLoading}
            setLoading={setAnalyzeLoading}
          />
          {analyzeError && <div className="error">{analyzeError}</div>}
          {analyzeResult && <AnalysisResultView result={analyzeResult} />}
        </>
      )}

      {tab === "features" && (
        <>
          <MultiFileUpload
            onResult={(r) => { setFeaturesError(null); setFeaturesResult(r); }}
            onError={(msg) => { setFeaturesError(msg); setFeaturesResult(null); }}
            loading={featuresLoading}
            setLoading={setFeaturesLoading}
          />
          {featuresError && <div className="error">{featuresError}</div>}
          {featuresResult && (
            <FeatureExtraction
              result={featuresResult}
              onSave={handleSaveSelection}
              savedIds={savedIds}
            />
          )}
        </>
      )}

      {tab === "integrate" && (
        <IntegrationView
          selections={savedSelections}
          onRemove={handleRemoveSelection}
        />
      )}
    </main>
  );
}
