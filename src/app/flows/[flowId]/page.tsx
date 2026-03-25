'use client';

import { useState, useEffect, use, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Save, Play, History, Monitor, Wifi, WifiOff, AlertTriangle, ChevronRight, Home, ExternalLink, FileText, ChevronLeft, ChevronRight as ChevronRightIcon, TrendingUp, Clock, Target, Terminal, Box, Loader2, Zap, ChevronDown } from "lucide-react";
import Link from 'next/link';
import { toast, Toaster } from 'sonner';
import { FlowData, JobData, ScheduleType } from '@/lib/filestore';

export default function FlowEditPage({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = use(params);
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [history, setHistory] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastStartedJobId, setLastStartedJobId] = useState<string | null>(null);
  
  // Track if user has modified anything to prevent auto-refresh from overwriting
  const [isDirty, setIsDirty] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reportSummaryOpen, setReportSummaryOpen] = useState(true);
  const [reportProductsOpen, setReportProductsOpen] = useState(true);

  // Stream / Interaction State
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamJobIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [inputText, setInputText] = useState('');

  // Analytics Memoization
  const analytics = useMemo(() => {
    if (!history.length) return { successRate: 0, avgSpeed: 0, total: 0 };
    const completed = history.filter(j => j.status === 'completed');
    const speeds = completed.map(j => j.metrics?.lcp || 0).filter(s => s > 0);
    return {
      total: history.length,
      successRate: Math.round((completed.length / history.length) * 100),
      avgSpeed: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0
    };
  }, [history]);

  const fetchData = async (forceUpdate = false) => {
    try {
      const [flowRes, jobsRes] = await Promise.all([
        fetch(`/api/flows/${flowId}`, { cache: 'no-store' }),
        fetch('/api/jobs', { cache: 'no-store' })
      ]);
      const flowData = await flowRes.json();
      const jobsData = await jobsRes.json();
      
      // Only update flow config if forceUpdate is true OR user hasn't made changes
      if (flowData && !flowData.error && (forceUpdate || !isDirty)) {
          setFlow(flowData);
      }
      
      if (!Array.isArray(jobsData)) {
        return;
      }
      const flowJobs = jobsData.filter((j: JobData) => j.flowId === flowId);
      const hasRunning = !!flowJobs.find((j: JobData) => j.status === 'running');

      if (hasRunning) {
        const runningJob = flowJobs
          .filter((j: JobData) => j.status === 'running')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (runningJob && !streamJobIdRef.current) {
          streamJobIdRef.current = runningJob._id;
        }
      } else {
        streamJobIdRef.current = null;
      }

      setHistory(flowJobs);
      setRunning(hasRunning);

      // If we recently started a job and it has now finished, surface the result
      if (lastStartedJobId && !hasRunning) {
        const completed = flowJobs.find((j: JobData) => j._id === lastStartedJobId && j.status !== 'running');
        if (completed) {
          toast.success('Flow run completed. Opening report...');
          setLastStartedJobId(null);
          openReport(completed);
        }
      }
    } catch {
      console.error('Failed to fetch data');
    }
  };

  // Initial load
  useEffect(() => {
    fetchData(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  // Background refresh for history and status only
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, running ? 2000 : 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, isDirty, running]);

  useEffect(() => {
    if (!running) {
      streamJobIdRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) wsRef.current.close();
      setWsConnected(false);
      return;
    }

    const livePreview = process.env.NEXT_PUBLIC_ENABLE_LIVE_PREVIEW === 'true';
    if (!livePreview) {
      setWsConnected(false);
      return;
    }

    const isLocalhost =
      typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalhost) {
      const connectWs = () => {
        const host = window.location.hostname || 'localhost';
        const ws = new WebSocket(`ws://${host}:3002`);
        wsRef.current = ws;
        ws.onopen = () => {
          setWsConnected(true);
          setWsError(false);
          const jobId = streamJobIdRef.current;
          if (jobId) ws.send(JSON.stringify({ type: 'init', jobId }));
        };
        ws.onmessage = async (event) => {
          if (event.data instanceof Blob) {
            const url = URL.createObjectURL(event.data);
            if (imageRef.current) {
              const oldUrl = imageRef.current.src;
              imageRef.current.src = url;
              if (oldUrl.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(oldUrl), 100);
            }
          }
        };
        ws.onclose = () => {
          setWsConnected(false);
          if (streamJobIdRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              connectWs();
            }, 2000);
          }
        };
        ws.onerror = () => {
          setWsError(true);
          setWsConnected(false);
        };
      };
      connectWs();
      return () => {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        wsRef.current?.close();
      };
    }

    const pollMs = Math.max(400, parseInt(process.env.NEXT_PUBLIC_STREAM_POLL_MS || '800', 10) || 800);
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const jobId = streamJobIdRef.current;
      if (!jobId) return;
      try {
        const r = await fetch(`/api/stream/${jobId}`, { cache: 'no-store' });
        if (!r.ok) {
          setWsError(true);
          return;
        }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        if (imageRef.current) {
          const oldUrl = imageRef.current.src;
          imageRef.current.src = url;
          if (oldUrl.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(oldUrl), 100);
        }
        setWsConnected(true);
        setWsError(false);
      } catch {
        setWsError(true);
        setWsConnected(false);
      }
    };

    void tick();
    const id = setInterval(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running]);

  const saveFlow = async () => {
    if (!flow) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flow)
      });
      if (res.ok) {
        const updated = await res.json();
        setFlow(updated);
        setIsDirty(false); // Reset dirty state after save
        toast.success('Settings saved');
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setLoading(false);
    }
  };

  const runNow = async () => {
    if (!flow) return;
    setLoading(true);
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: flow.brandId,
          type: flow.type,
          url: flow.url,
          formData: flow.formData,
          flowId: flow.id
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const jobId = data && typeof data.jobId === 'string' ? data.jobId : null;
        if (jobId) {
          streamJobIdRef.current = jobId;
          setLastStartedJobId(jobId);
          setRunning(true);
          setHistory(prev => [{
            _id: jobId,
            flowId: flow.id,
            brandId: flow.brandId,
            type: flow.type,
            status: 'running',
            logs: ['Started ' + flow.type + ' for ' + flow.brandId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, ...prev]);
        }
        toast.success('Started flow');
        fetchData(false);
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        const msg = typeof err?.error === 'string' ? err.error : res.statusText || 'Failed to start';
        toast.error(msg);
      }
    } catch {
      toast.error('Failed to start');
    } finally {
      setLoading(false);
    }
  };

  const handleInteraction = async (type: string, payload: Record<string, unknown>) => {
    const jobId = streamJobIdRef.current;
    if (!jobId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }));
      return;
    }
    try {
      await fetch(`/api/interact/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...payload }),
      });
    } catch {
      toast.error('Interaction failed');
    }
  };

  // Reset report accordion when opening a different job
  useEffect(() => {
    if (selectedJob) {
      setReportSummaryOpen(true);
      setReportProductsOpen(true);
    }
  }, [selectedJob?._id]);

  const openReport = (job: JobData) => {
    setSelectedJob(job);
    setIsModalOpen(true);
  };

  const updateFlow = (updates: any) => {
    setFlow(prev => prev ? { ...prev, ...updates } : null);
    setIsDirty(true);
  };

  if (!flow) return <div className="p-20 text-center text-slate-400 font-bold animate-pulse uppercase tracking-widest text-[10px]">LOADING...</div>;

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const paginatedHistory = history.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const activeJob = history.find(j => j.status === 'running');

  return (
    <div className="min-h-screen p-8 pb-24 relative overflow-hidden text-slate-800">
      <Toaster position="top-right" richColors />
      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <Link href="/" className="hover:text-indigo-600 transition-colors cursor-pointer">DASHBOARD</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/brands/${flow.brandId}`} className="hover:text-indigo-600 transition-colors uppercase tracking-wider cursor-pointer">{flow.brandId.replace('-', ' ')}</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900">{flow.name}</span>
        </nav>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white/40 backdrop-blur-xl p-10 rounded-[3rem] ring-1 ring-slate-200/50 shadow-2xl shadow-slate-200/20">
          <div className="flex items-start gap-8">
            <Link href={`/brands/${flow.brandId}`}>
              <Button variant="ghost" size="icon" className="rounded-3xl h-16 w-14 bg-white shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 cursor-pointer">
                <ArrowLeft className="h-6 w-6 text-slate-600" />
              </Button>
            </Link>
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <h1 className="text-5xl font-black text-slate-900 tracking-tighter uppercase italic">{flow.name}</h1>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <Button onClick={runNow} disabled={loading || running} className="h-16 px-10 bg-slate-900 text-white rounded-3xl font-black tracking-widest transition-all hover:bg-indigo-600 hover:shadow-2xl hover:shadow-indigo-200 active:scale-95 text-sm text-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-70">
              {running ? <Loader2 className="animate-spin h-5 w-5" /> : <><Play className="mr-3 h-5 w-5 fill-current" /> EXECUTE NOW</>}
            </Button>
            <Button onClick={saveFlow} disabled={loading || !isDirty} variant="outline" className="h-16 px-10 rounded-3xl font-black tracking-widest border-slate-200 text-slate-600 hover:bg-white transition-all shadow-sm bg-white/50 text-sm text-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="mr-3 h-5 w-5" /> SAVE
            </Button>
          </div>
        </div>

        {/* Analytics Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
                { label: 'Success Rate', value: `${analytics.successRate}%`, icon: TrendingUp, color: 'indigo' },
                { label: 'Avg Speed', value: `${analytics.avgSpeed}ms`, icon: Clock, color: 'emerald' },
                { label: 'Total Runs', value: analytics.total, icon: Target, color: 'purple' }
            ].map((stat, i) => {
                const StatIcon = stat.icon;
                return (
                    <motion.div key={i} whileHover={{ y: -5 }}>
                        <Card className="border-none shadow-xl rounded-[2rem] bg-white/60 backdrop-blur-md ring-1 ring-slate-200/50 overflow-hidden">
                            <CardContent className="p-8 flex items-center gap-6">
                                <div className={`w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600`}>
                                    <StatIcon className="h-7 w-7" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
                                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{stat.value}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                );
            })}
        </div>

        {/* Last run summary */}
        {!running && history.length > 0 && (
          <Card className="border-none shadow-xl rounded-[2rem] bg-white/80 backdrop-blur-md ring-1 ring-slate-200/70 overflow-hidden">
            <CardContent className="p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              {(() => {
                const latestJob = [...history].sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )[0];

                const isCollection = flow.type === 'collection-scrape';
                const products = isCollection && latestJob.results?.products ? latestJob.results.products : null;
                const productCount = products ? products.length : null;
                const inStockCount = products
                  ? products.filter((p: any) => p.variants?.some((v: any) => v.available)).length
                  : null;

                return (
                  <>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                        Last Run
                      </p>
                      <div className="flex items-center gap-3">
                        <Badge
                          className={`text-[9px] font-black px-3 py-1 border-none ${
                            latestJob.status === 'completed'
                              ? 'bg-emerald-500 text-white'
                              : latestJob.status === 'failed'
                              ? 'bg-rose-500 text-white'
                              : 'bg-amber-500 text-white'
                          }`}
                        >
                          {latestJob.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-mono text-slate-600">
                          {new Date(latestJob.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <h2 className="text-xl font-black text-slate-800 tracking-tight">
                        {flow.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 font-semibold">
                        {isCollection && productCount !== null && (
                          <span>{productCount} products found</span>
                        )}
                        {isCollection && inStockCount !== null && (
                          <span>{inStockCount} in stock</span>
                        )}
                        {latestJob.metrics?.performanceScore !== undefined && (
                          <span>Performance {latestJob.metrics.performanceScore}%</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 md:justify-end">
                      <Button
                        variant="outline"
                        className="rounded-2xl px-6 h-11 text-[10px] font-black tracking-[0.2em] text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                        onClick={() => openReport(latestJob)}
                      >
                        VIEW FULL REPORT
                      </Button>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          {/* Main Area */}
          <div className="xl:col-span-8 space-y-8">
            
            {/* Live Viewport */}
            <AnimatePresence>
                {running && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                    >
                        <Card className="border-none shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] rounded-[3rem] bg-slate-900 ring-[8px] ring-indigo-500/10 overflow-hidden">
                            <div className="grid grid-cols-1 lg:grid-cols-3">
                                <div className="lg:col-span-2 relative aspect-video bg-black flex items-center justify-center border-r border-slate-800">
                                    <img 
                                        ref={imageRef}
                                        alt="Live Stream"
                                        className="max-w-full max-h-full object-contain cursor-crosshair"
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = (e.clientX - rect.left) * (1280 / rect.width);
                                            const y = (e.clientY - rect.top) * (720 / rect.height);
                                            handleInteraction('click', { x, y });
                                        }}
                                    />
                                    {!wsConnected && (
                                        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
                                            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                            <span className="text-[10px] font-black text-indigo-400 tracking-[0.4em] uppercase animate-pulse">Connecting...</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col bg-[#0c0c14]">
                                    <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                                        <div className="flex items-center gap-3">
                                            <Terminal className="h-4 w-4 text-emerald-500" />
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">LIVE LOGS</span>
                                        </div>
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                    </div>
                                    <ScrollArea className="flex-1 p-8">
                                        <div className="space-y-3">
                                            {activeJob?.logs?.map((l, i) => (
                                                <div key={i} className="text-[10px] font-mono text-slate-400 leading-relaxed flex gap-3 group">
                                                    <span className="text-slate-700 select-none font-bold">[{i+1}]</span>
                                                    <span className="text-slate-300 group-hover:text-emerald-400 transition-colors">{l}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                    <div className="p-6 bg-slate-900/80 border-t border-slate-800 flex gap-3">
                                        <Input 
                                            placeholder="Type text..." 
                                            className="h-10 bg-black border-slate-700 text-xs font-mono text-slate-300 rounded-xl"
                                            value={inputText}
                                            onChange={e => setInputText(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (handleInteraction('type', { text: inputText }), setInputText(''))}
                                        />
                                        <Button size="sm" className="h-10 px-6 bg-indigo-600 font-bold text-[10px] rounded-xl cursor-pointer" onClick={() => (handleInteraction('type', { text: inputText }), setInputText(''))}>SEND</Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="border-none shadow-xl ring-1 ring-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white/80 backdrop-blur-md transition-all hover:shadow-2xl group">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8 pb-6">
                        <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="p-10 space-y-8">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <Zap className={`h-4 w-4 ${flow.isShopify ? 'text-indigo-600 fill-indigo-600' : 'text-slate-300'}`} />
                                    <Label className="text-[10px] font-black uppercase tracking-widest cursor-pointer" htmlFor="shopify-mode">Shopify Engine</Label>
                                </div>
                                <input 
                                    type="checkbox" 
                                    id="shopify-mode"
                                    checked={flow.isShopify || false}
                                    onChange={e => updateFlow({ isShopify: e.target.checked })}
                                    className="w-4 h-4 rounded-full accent-indigo-600 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Flow Name</Label>
                            <Input value={flow.name} onChange={e => updateFlow({ name: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none font-black text-lg focus:ring-4 focus:ring-indigo-500/10" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Type</Label>
                            <Select value={flow.type} onValueChange={(val: any) => updateFlow({ type: val })}>
                                <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-black text-indigo-600 shadow-inner text-xs cursor-pointer">
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="form-submission">Lead Generation</SelectItem>
                                    <SelectItem value="collection-scrape">Inventory Scraper</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">URL</Label>
                            <Input value={flow.url} onChange={e => updateFlow({ url: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none font-mono text-[10px] focus:ring-4 focus:ring-indigo-500/10" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-xl ring-1 ring-slate-200/50 rounded-[2.5rem] overflow-hidden bg-white/80 backdrop-blur-md transition-all hover:shadow-2xl group">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8 pb-6">
                        <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Schedule</CardTitle>
                    </CardHeader>
                    <CardContent className="p-10 space-y-6">
                        <div className="space-y-3 text-left">
                            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Repeat</Label>
                            <Select value={flow.schedule.type} onValueChange={(val: ScheduleType) => updateFlow({ schedule: { ...flow.schedule, type: val } })}>
                                <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-black text-indigo-600 shadow-inner text-xs cursor-pointer">
                                    <SelectValue placeholder="Frequency" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="manual">Manual</SelectItem>
                                    <SelectItem value="hourly">Hourly</SelectItem>
                                    <SelectItem value="daily">Daily</SelectItem>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Granular Schedule Controls */}
                        {flow.schedule.type !== 'manual' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[9px] font-black text-slate-400 uppercase px-1">Time</Label>
                                    <Input 
                                        type="time" 
                                        value={flow.schedule.time || "09:00"} 
                                        onChange={e => updateFlow({ schedule: { ...flow.schedule, time: e.target.value } })}
                                        className="h-10 rounded-xl bg-slate-50 border-none text-xs font-bold"
                                    />
                                </div>
                                {flow.schedule.type === 'weekly' && (
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[9px] font-black text-slate-400 uppercase px-1">Day</Label>
                                        <Select value={flow.schedule.dayOfWeek || "1"} onValueChange={(val) => updateFlow({ schedule: { ...flow.schedule, dayOfWeek: val } })}>
                                            <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-none text-[10px] font-bold cursor-pointer">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">Monday</SelectItem>
                                                <SelectItem value="2">Tuesday</SelectItem>
                                                <SelectItem value="3">Wednesday</SelectItem>
                                                <SelectItem value="4">Thursday</SelectItem>
                                                <SelectItem value="5">Friday</SelectItem>
                                                <SelectItem value="6">Saturday</SelectItem>
                                                <SelectItem value="0">Sunday</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {flow.schedule.type === 'monthly' && (
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[9px] font-black text-slate-400 uppercase px-1">Date</Label>
                                        <Input 
                                            type="number" min="1" max="31"
                                            value={flow.schedule.dayOfMonth || 1} 
                                            onChange={e => updateFlow({ schedule: { ...flow.schedule, dayOfMonth: parseInt(e.target.value) } })}
                                            className="h-10 rounded-xl bg-slate-50 border-none text-xs font-bold"
                                        />
                                    </div>
                                )}
                            </motion.div>
                        )}

                        <Button 
                            type="button"
                            variant={flow.schedule.active ? "default" : "outline"}
                            className={`h-16 rounded-[2rem] font-black w-full border-none shadow-xl transition-all text-xs tracking-[0.2em] mt-4 cursor-pointer ${flow.schedule.active ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                            onClick={() => updateFlow({ schedule: { ...flow.schedule, active: !flow.schedule.active } })}
                        >
                            {flow.schedule.active ? "ACTIVE" : "START"}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* History Table */}
            <div className="space-y-8 pt-16">
                <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-900 rounded-2xl shadow-xl">
                            <History className="h-6 w-6 text-indigo-400" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase italic">History</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Badge className="bg-slate-800 text-white font-black px-6 h-12 rounded-2xl text-[10px] tracking-[0.2em]">Page {currentPage} of {totalPages || 1}</Badge>
                        <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                            <ChevronRightIcon className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                <Card className="border-none shadow-2xl ring-1 ring-slate-200/50 rounded-[3rem] overflow-hidden bg-white/60 backdrop-blur-xl">
                    <Table>
                        <TableHeader className="bg-slate-800">
                            <TableRow className="hover:bg-transparent border-none">
                                <TableHead className="font-black text-[9px] uppercase tracking-[0.3em] text-slate-200 py-8 pl-12">Status</TableHead>
                                <TableHead className="font-black text-[9px] uppercase tracking-[0.3em] text-slate-200 py-8">Timestamp</TableHead>
                                <TableHead className="font-black text-[9px] uppercase tracking-[0.3em] text-slate-200 py-8">Performance</TableHead>
                                <TableHead className="font-black text-[9px] uppercase tracking-[0.3em] text-slate-200 py-8 text-right pr-12">Report</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedHistory.map(job => (
                                <TableRow key={job._id} className="border-slate-200 hover:bg-indigo-50/30 transition-all cursor-default group">
                                    <TableCell className="pl-12 py-10">
                                        <div className={`flex items-center gap-3 font-black text-[10px] tracking-[0.2em] ${
                                            job.status === 'completed' ? 'text-emerald-600' : 
                                            job.status === 'failed' ? 'text-rose-600' : 'text-amber-600'
                                        }`}>
                                            <div className={`w-2 h-2 rounded-full ${
                                                job.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                                                job.status === 'failed' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'
                                            }`} />
                                            {job.status.toUpperCase()}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-10">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-base font-black text-slate-800 tracking-tight">{new Date(job.createdAt).toLocaleDateString()}</span>
                                            <span className="text-[10px] text-slate-600 font-mono font-bold">{new Date(job.createdAt).toLocaleTimeString()}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-10">
                                        {job.metrics ? (
                                            <div className="flex items-center gap-8">
                                                <div className="flex flex-col">
                                                    <span className={`text-2xl font-black ${job.metrics.performanceScore! > 80 ? 'text-emerald-600' : job.metrics.performanceScore! > 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                        {job.metrics.performanceScore}%
                                                    </span>
                                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Score</span>
                                                </div>
                                                <div className="h-10 w-px bg-slate-200" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-slate-700">{job.metrics.lcp}ms</span>
                                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">LCP</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] italic">...</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right pr-12 py-10">
                                        <Button 
                                            className="rounded-2xl font-black text-[10px] tracking-widest bg-slate-800 text-white shadow-xl hover:bg-indigo-600 uppercase cursor-pointer" 
                                            onClick={() => openReport(job)}
                                        >
                                            View Report
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="xl:col-span-4 space-y-8">
            <Card className="border-none shadow-2xl ring-1 ring-slate-200/50 rounded-[3rem] overflow-hidden bg-slate-900 sticky top-24 transition-all hover:shadow-indigo-200/20">
                <CardHeader className="bg-slate-900 p-10 pb-6 border-b border-slate-800">
                    <CardTitle className="text-[10px] font-black tracking-[0.4em] uppercase text-indigo-400">Form Data</CardTitle>
                </CardHeader>
                <CardContent className="p-10 space-y-10">
                    {flow.type === 'form-submission' ? (
                        <AnimatePresence mode="wait">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Name</Label>
                                    <Input 
                                        value={flow.formData?.name || ''} 
                                        onChange={e => updateFlow({ formData: { ...flow.formData, name: e.target.value } })} 
                                        className="h-14 rounded-2xl bg-slate-800 border-none font-black text-white focus:ring-4 focus:ring-indigo-500/20" 
                                    />
                                </div>
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Phone</Label>
                                    <Input 
                                        value={flow.formData?.phone || ''} 
                                        onChange={e => updateFlow({ formData: { ...flow.formData, phone: e.target.value } })} 
                                        className="h-14 rounded-2xl bg-slate-800 border-none font-mono text-indigo-400 focus:ring-4 focus:ring-indigo-500/20" 
                                    />
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    ) : (
                        <div className="py-20 text-center text-slate-700 italic border-2 border-dashed border-slate-800 rounded-[2.5rem]">
                            <Box className="h-12 w-12 mx-auto mb-6 opacity-10" />
                            <p className="text-[9px] font-black uppercase tracking-[0.3em]">No Data Required</p>
                        </div>
                    )}
                </CardContent>
            </Card>
          </div>

        </div>
      </div>

      {/* Report Modal - full width, scrollable body */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="!max-w-[96vw] sm:!max-w-[96vw] w-[96vw] max-h-[90vh] p-0 border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white ring-1 ring-slate-200 flex flex-col gap-0">
          <DialogHeader className="shrink-0 p-8 md:p-10 bg-slate-900 text-white rounded-t-[2rem] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-600/10 blur-[100px] rounded-full" />
            <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 text-indigo-400 font-black text-[10px] tracking-[0.4em] uppercase">
                        <FileText className="h-4 w-4" /> Run Details
                    </div>
                    <DialogTitle className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic text-white">{flow.name}</DialogTitle>
                    <DialogDescription className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                        Run Date: {selectedJob && new Date(selectedJob.createdAt).toLocaleString()}
                    </DialogDescription>
                </div>
                {selectedJob && (
                    <Badge className={`${selectedJob.status === 'completed' ? 'bg-emerald-500' : 'bg-rose-500'} uppercase font-black px-4 h-9 rounded-xl shadow-lg text-xs tracking-widest border-none`}>
                        {selectedJob.status.toUpperCase()}
                    </Badge>
                )}
            </div>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 md:p-8 bg-[#f8fafc]">
            {selectedJob && flow.type === 'collection-scrape' && selectedJob.results?.products ? (
                <div className="space-y-6 w-full">
                    {/* Collapsible: Run summary */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-md">
                        <button
                          type="button"
                          onClick={() => setReportSummaryOpen((o) => !o)}
                          className="w-full px-5 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 border-b border-slate-200 transition-colors text-left cursor-pointer"
                        >
                          <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Run summary</h3>
                          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${reportSummaryOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence initial={false}>
                          {reportSummaryOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {[
                                    { l: 'Products Found', v: selectedJob.results.products.length, colorClass: 'text-slate-700' },
                                    { l: 'In Stock', v: selectedJob.results.products.filter((p: any) => p.variants?.some((v: any) => v.available)).length, colorClass: 'text-emerald-600' },
                                    { l: 'Performance', v: `${selectedJob.metrics?.performanceScore ?? '--'}%`, colorClass: 'text-indigo-600' }
                                ].map((s, i) => (
                                    <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex flex-col gap-1">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.l}</p>
                                        <p className={`text-2xl font-black tracking-tighter ${s.colorClass}`}>{s.v}</p>
                                    </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                    </div>

                    {/* Collapsible: Product list - full width, URLs wrap */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-md">
                        <button
                          type="button"
                          onClick={() => setReportProductsOpen((o) => !o)}
                          className="w-full px-5 py-3 flex items-center justify-between bg-slate-100 hover:bg-slate-200/80 border-b border-slate-200 transition-colors text-left cursor-pointer"
                        >
                          <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                            Product list ({selectedJob.results.products.length})
                          </h3>
                          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${reportProductsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence initial={false}>
                          {reportProductsOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-x-auto overflow-y-visible"
                            >
                              <Table>
                                <TableHeader className="bg-slate-50">
                                  <TableRow className="hover:bg-transparent border-none">
                                    <TableHead className="font-black text-[10px] uppercase text-slate-600 tracking-widest p-4 whitespace-nowrap">Product</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase text-slate-600 tracking-widest p-4 text-right whitespace-nowrap">Inventory</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedJob.results.products.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={2} className="p-8 text-center text-slate-500 font-medium">
                                        No products recorded for this run.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    selectedJob.results.products.map((product: any, idx: number) => (
                                    <TableRow key={idx} className="border-slate-100 hover:bg-slate-50/80 transition-colors">
                                        <TableCell className="p-4 align-top min-w-[280px]">
                                            <p className="font-black text-slate-800 text-sm leading-tight mb-1">
                                                {product?.name ?? 'Unnamed product'}
                                            </p>
                                            <a href={product?.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 font-mono hover:underline break-words cursor-pointer block" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                {product?.url ?? '—'}
                                                <ExternalLink className="h-3 w-3 shrink-0 inline ml-1 align-middle" />
                                            </a>
                                        </TableCell>
                                        <TableCell className="p-4 text-right align-top whitespace-nowrap">
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                {Array.isArray(product?.variants) && product.variants.length > 0 ? (
                                                    product.variants.map((v: any, vIdx: number) => (
                                                        <Badge key={vIdx} className={`text-[9px] font-black px-2 py-0.5 border-none shadow-sm ${v.available ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                                            {v?.name ?? 'Variant'}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-slate-500">—</span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    ))
                                  )}
                                </TableBody>
                              </Table>
                            </motion.div>
                          )}
                        </AnimatePresence>
                    </div>
                </div>
            ) : (
                <div className="space-y-6 w-full">
                    <div className="p-6 md:p-8 bg-slate-900 rounded-xl shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-cyan-500" />
                        <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.5em] mb-4 flex items-center gap-3">
                            <Terminal className="h-5 w-5" /> Trace_Log
                        </h4>
                        <div className="space-y-2 font-mono text-sm leading-relaxed max-h-[40vh] overflow-auto px-2 pb-4 text-slate-300">
                            {selectedJob?.logs?.length ? selectedJob.logs.map((log: string, i: number) => (
                                <div key={i} className="flex gap-4 hover:bg-white/5 p-2 rounded-lg transition-colors">
                                    <span className="text-slate-500 select-none font-black w-8 text-right shrink-0">{i + 1}</span>
                                    <span className="text-indigo-500/60 font-bold select-none shrink-0">{'>>>'}</span>
                                    <span className="break-words">{log}</span>
                                </div>
                            )) : (
                                <p className="text-slate-500 italic">No logs for this run.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
          </div>
          
          <div className="shrink-0 p-6 bg-slate-100 border-t border-slate-200 flex justify-end">
            <Button onClick={() => setIsModalOpen(false)} className="rounded-2xl px-10 h-12 bg-slate-800 text-white font-black tracking-widest hover:bg-indigo-600 transition-all active:scale-95 shadow-xl text-sm uppercase cursor-pointer">
                Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

