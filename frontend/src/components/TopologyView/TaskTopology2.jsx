import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, interpolateSnapshots } from '../../engine/interpolate'

const GRAPH_LABELS = ['Dense Structure', 'Sparse Network']
const CORRECT_COLOR = '#22c55e'
const WRONG_COLOR = '#ef4444'
const FEATURE_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6']

function MiniGraphSVG({ nodes, links, contributions, size = 100 }) {
    const padding = 15;
    const r = (size - padding * 2) / 2;
    const cx = size / 2;
    const cy = size / 2;
    
    const nodePos = useMemo(() => {
        const pos = {};
        const n = nodes.length;
        nodes.forEach((node, i) => {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            pos[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
        });
        return pos;
    }, [nodes, r, cx, cy]);

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="drop-shadow-lg">
            {links.map((link, i) => {
                const s = typeof link.source === 'object' ? link.source.id : link.source;
                const t = typeof link.target === 'object' ? link.target.id : link.target;
                const p1 = nodePos[s], p2 = nodePos[t];
                if (!p1 || !p2) return null;
                return (
                    <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                          stroke="rgba(148,163,184,0.1)" strokeWidth="0.8" />
                );
            })}
            {nodes.map((node, i) => {
                const p = nodePos[node.id];
                if (!p) return null;
                const weight = contributions ? (contributions[i] || 0) : 0.5;
                
                const nodeFill = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6';
                const nodeSize = 2.5 + weight * 4.5;

                return (
                    <g key={node.id}>
                        {weight > 0.7 && (
                            <circle cx={p.x} cy={p.y} r={nodeSize + 3} fill={nodeFill} opacity="0.15">
                                <animate attributeName="r" values={`${nodeSize+2};${nodeSize+5};${nodeSize+2}`} dur="2s" repeatCount="indefinite" />
                            </circle>
                        )}
                        <circle cx={p.x} cy={p.y} r={nodeSize} fill={nodeFill} className="transition-all duration-500" />
                    </g>
                );
            })}
        </svg>
    )
}

export default function TaskTopology2() {
    const { snapshots, currentEpochFloat, isPlaying } = usePlayerStore()
    const taskData = useGNNStore((s) => s.taskData)
    const [selectedGraphIdx, setSelectedGraphIdx] = useState(null)
    const fgRefDetail = useRef();

    const graphs = taskData?.graphs || []
    
    const detailGraphData = useMemo(() => {
        if (selectedGraphIdx === null || !graphs[selectedGraphIdx]) return null;
        const g = graphs[selectedGraphIdx];
        // Ensure stable refs for D3
        return { 
            nodes: g.nodes.map(n => ({ ...n })), 
            links: g.links.map(l => ({ ...l })) 
        };
    }, [selectedGraphIdx, graphs]);

    const epochInt = Math.floor(currentEpochFloat);
    const snap = snapshots[epochInt] || snapshots[snapshots.length - 1];

    const contributions = snap?.node_contributions || [];
    const predictions = snap?.graph_predictions || [];
    const confidenceScores = snap?.graph_confidences || [];

    // High-performance Canvas Redraw
    const renderNodeDetail = useCallback((node, ctx, globalScale) => {
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

        const graphContribs = contributions[selectedGraphIdx] || [];
        const weight = graphContribs[node.id] || 0;
        
        const color = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6';
        const size = (4 + weight * 12) / Math.sqrt(globalScale);
        
        // 1. Bloom Layer
        ctx.save();
        const glowR = size * 3;
        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
        grad.addColorStop(0, weight > 0.5 ? `${color}44` : `${color}22`);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // 2. Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // 3. Pulse Ring for high contributors
        if (weight > 0.7) {
            const pulse = (Math.sin(Date.now() / 200 + node.id) + 1) * 1.5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 2 + pulse, 0, 2 * Math.PI);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();
        }

        // 4. Node ID
        const fontSize = Math.max(7, 10 / Math.sqrt(globalScale));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = weight > 0.6 ? '#0f172a' : '#fff';
        ctx.fillText(`${node.id}`, node.x, node.y);
    }, [selectedGraphIdx, contributions]);

    useEffect(() => {
        if (selectedGraphIdx !== null && fgRefDetail.current) {
            const fg = fgRefDetail.current;
            fg.d3Force('charge').strength(-100).distanceMax(250);
            fg.d3Force('link').distance(40);
            fg.d3Force('center').strength(0.1);
            fg.d3ReheatSimulation();
        }
    }, [selectedGraphIdx]);

    // Compute detail data (always, no conditional returns before this)
    const showDetail = selectedGraphIdx !== null && detailGraphData && graphs.length > 0;
    const g = showDetail ? graphs[selectedGraphIdx] : null;
    const pred = showDetail ? predictions[selectedGraphIdx] : undefined;
    const isCorrect = showDetail ? pred === g.groundTruth : false;
    const conf = showDetail ? (confidenceScores[selectedGraphIdx] || 0.5) : 0;

    if (!graphs.length) {
        return <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">No graph data</div>;
    }

    if (showDetail) {
        return (
            <div key="detail_view" className="w-full h-full relative bg-slate-950 overflow-hidden">
                {/* Layer 1: Graph Canvas */}
                <div className="absolute inset-0" style={{ zIndex: 1 }}>
                    <ForceGraph2D
                        ref={fgRefDetail}
                        graphData={detailGraphData}
                        nodeCanvasObject={renderNodeDetail}
                        nodeCanvasObjectMode={() => 'replace'}
                        linkColor={() => 'rgba(59, 130, 246, 0.15)'}
                        linkWidth={1.5}
                        backgroundColor="transparent"
                        onEngineStop={() => {
                            if (fgRefDetail.current) fgRefDetail.current.zoomToFit(400, 80);
                        }}
                    />
                </div>

                {/* Layer 2: Overlay UI (completely separate stacking context) */}
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50 }}>
                    <div className="absolute top-2 left-2 flex flex-col gap-2">
                        <button onClick={() => setSelectedGraphIdx(null)}
                                className="pointer-events-auto px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider bg-slate-900/95 text-slate-300 hover:bg-slate-800 transition-all border border-slate-700/50 uppercase shadow-xl cursor-pointer">
                            ← Exit
                        </button>
                        
                        <div className="bg-slate-900/95 border border-slate-700/40 px-3 py-2.5 rounded-xl min-w-[200px] pointer-events-auto shadow-xl">
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <h2 className="text-sm font-bold text-white leading-tight">{GRAPH_LABELS[g.groundTruth]}</h2>
                                    <p className="text-[8px] text-slate-500 font-mono">#{selectedGraphIdx} | {g.nodes.length}n/{g.links.length}e</p>
                                </div>
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${isCorrect ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                    {isCorrect ? '✓' : '✗'}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[8px] text-slate-500 uppercase font-bold">Confidence</span>
                                        <span className={`text-[10px] font-bold font-mono ${conf > 0.8 ? 'text-green-400' : 'text-amber-400'}`}>{(conf * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden">
                                        <div className={`h-full transition-all duration-500 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${conf * 100}%` }} />
                                    </div>
                                </div>

                                <div className="pt-1">
                                    <span className="text-[8px] text-slate-500 uppercase font-bold block mb-1.5 border-l-2 border-amber-500 pl-1.5">
                                        Top Contributors
                                    </span>
                                    {(() => {
                                        const contribs = contributions[selectedGraphIdx] || [];
                                        const topNodes = contribs
                                            .map((val, idx) => ({ id: idx, val }))
                                            .sort((a, b) => b.val - a.val)
                                            .slice(0, 3);
                                        
                                        if (topNodes.length === 0) {
                                            return <div className="text-[8px] text-slate-600 italic">No data yet</div>;
                                        }
                                        
                                        return topNodes.map((node, i) => (
                                            <div key={i} className="flex items-center justify-between mb-1 last:mb-0">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded flex items-center justify-center bg-slate-800/80 text-[9px] font-bold text-slate-100">
                                                        {node.id}
                                                    </div>
                                                    <div className="h-1 w-16 bg-slate-800/50 rounded-full overflow-hidden">
                                                        <div className="h-full bg-amber-500" style={{ width: `${node.val * 100}%` }} />
                                                    </div>
                                                </div>
                                                <span className="text-[9px] font-bold font-mono text-amber-500">{(node.val * 100).toFixed(0)}%</span>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div key="grid_view" className="w-full h-full overflow-y-auto p-8 bg-slate-950 custom-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 max-w-[1600px] mx-auto">
                {graphs.slice(0, 50).map((g, i) => {
                    const pred = predictions[i]
                    const conf = confidenceScores[i] || 0
                    const isCorrect = pred === g.groundTruth
                    const hasResult = pred !== undefined
                    
                    return (
                        <div key={i} onClick={() => setSelectedGraphIdx(i)}
                             className={`group relative bg-slate-900/20 backdrop-blur-md rounded-[2rem] border-2 transition-all duration-500 cursor-pointer 
                                        hover:scale-[1.04] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]
                                        ${hasResult 
                                            ? (isCorrect ? 'border-green-500/20 hover:border-green-500/50' : 'border-red-500/20 hover:border-red-500/50') 
                                            : 'border-white/5 hover:border-white/10'}`}>
                            
                            {/* Classification Badge */}
                            {hasResult && (
                                <div className={`absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center border-2 border-slate-950 shadow-xl z-20 
                                                ${isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                    <span className="text-sm font-black">{isCorrect ? '✓' : '✗'}</span>
                                </div>
                            )}

                            <div className="h-44 p-6 relative">
                                <MiniGraphSVG nodes={g.nodes} links={g.links} contributions={contributions[i]} />
                                
                                {/* Confidence Overlay on Hover */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/60 rounded-t-[2rem] backdrop-blur-[2px]">
                                    <div className="text-center">
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter mb-1">Confidence</p>
                                        <p className={`text-2xl font-black font-mono ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                            {(conf * 100).toFixed(0)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-slate-900/40 rounded-b-[2rem] border-t border-white/5 flex items-center justify-between">
                                <div className="overflow-hidden">
                                    <p className="text-[11px] text-white font-black uppercase truncate tracking-tight">{GRAPH_LABELS[g.groundTruth]}</p>
                                    <p className="text-[8px] text-slate-500 font-bold font-mono">GRAPH #{i}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9px] text-slate-500 font-black px-2 py-0.5 rounded-full bg-white/5 uppercase">N:{g.nodes.length}</span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

