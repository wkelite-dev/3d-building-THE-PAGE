"use client";

import dynamic from "next/dynamic";

const PointCloudHero = dynamic(() => import('@/components/PointCloudHero'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[55vh] bg-slate-900/50 rounded-xl
      border border-teal-500/15 flex items-center justify-center">
      <span className="text-teal-500/50 font-mono text-xs
        tracking-widest animate-pulse">
        INITIALIZING WEBGL...
      </span>
    </div>
  )
})

export default function Page() {
  return (
    <main className="min-h-screen bg-[#0a0f1a]">
      {/* Section 1: Point Cloud WebGL Visualizer */}
      <section className="p-4">
        <PointCloudHero />
      </section>

      {/* Section 2: Original Scanner App */}
      <section>
        <iframe src="/index.html" className="w-full h-screen border-0" />
      </section>
    </main>
  );
}
