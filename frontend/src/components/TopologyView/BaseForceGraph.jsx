import React, { useRef, useEffect, useState, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'

/**
 * BaseForceGraph - Phiên bản SIÊU ỔN ĐỊNH.
 * Đảm bảo đồ thị không bị reset khi dữ liệu training đổ về liên tục.
 */
const BaseForceGraph = forwardRef(({
  data,
  nodeCanvasObject,
  linkCanvasObject,
  onRenderFramePre,
  onNodeClick,
  onNodeRightClick,
  onNodeHover,
  cooldownTicks = 100,
  forceConfig = { charge: -120, link: 35, center: 0.05 },
  extraForces = null,
  ...props
}, ref) => {
  const containerRef = useRef()
  const fgRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [stableData, setStableData] = useState(null)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const setHoveredNode = useGNNStore((s) => s.setHoveredNode)

  useImperativeHandle(ref, () => ({
    fgRef: fgRef,
    getGraphData: () => fgRef.current?.graphData(),
    zoomToFit: (ms, padding) => fgRef.current?.zoomToFit(ms, padding)
  }))

  // 1. Resize Handler
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDimensions({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // 2. Chỉ cập nhật dữ liệu cấu trúc (Nodes/Links) khi thực sự thay đổi số lượng
  // Giúp D3 không bị reset simulation ở mỗi epoch
  useEffect(() => {
    if (!data) return
    setStableData(prev => {
        if (!prev || prev.nodes.length !== data.nodes.length || prev.links.length !== data.links.length) {
            return {
                nodes: data.nodes.map(n => ({ ...n })),
                links: data.links.map((l, i) => ({ ...l, _idx: i }))
            }
        }
        return prev
    })
  }, [data])

  // 3. Setup Lực
  useEffect(() => {
    if (!fgRef.current || !stableData) return
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(forceConfig.charge).distanceMax(500)
    fg.d3Force('link')?.distance(forceConfig.link)
    fg.d3Force('center')?.strength(forceConfig.center)
    if (typeof extraForces === 'function') extraForces(fg)
  }, [stableData, forceConfig, extraForces])

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node.id)
    if (onNodeClick) onNodeClick(node)
  }, [setSelectedNode, onNodeClick])

  const handleNodeHover = useCallback((node) => {
    setHoveredNode(node?.id ?? null)
    if (onNodeHover) onNodeHover(node)
  }, [setHoveredNode, onNodeHover])

  if (!stableData) return <div ref={containerRef} className="w-full h-full bg-slate-900 animate-pulse flex items-center justify-center text-slate-700 text-[10px] uppercase font-black tracking-widest">Initializing Engine...</div>

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-transparent">
      <ForceGraph2D
        ref={fgRef}
        graphData={stableData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        onRenderFramePre={onRenderFramePre}
        onNodeClick={handleNodeClick}
        onNodeRightClick={onNodeRightClick}
        onNodeHover={handleNodeHover}
        cooldownTicks={cooldownTicks}
        backgroundColor="rgba(0,0,0,0)"
        enableNodeDrag={true}
        {...props}
      />
    </div>
  )
})

BaseForceGraph.displayName = 'BaseForceGraph'
export default BaseForceGraph
