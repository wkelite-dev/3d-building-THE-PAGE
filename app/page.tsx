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

const Studio3D = dynamic(() => import('@/components/Studio3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-slate-950 flex items-center justify-center border-t border-teal-500/10">
      <span className="text-teal-500/30 font-mono text-sm tracking-[0.2em] animate-pulse">
        LOADING 3D STUDIO...
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

      {/* Section 2: Studio 3D App */}
      <section className="border-t border-slate-800/50">
        <Studio3D />
      </section>
    </main>
  );
}
