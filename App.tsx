
import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  Loader2, 
  Download, 
  Trash2, 
  LayoutGrid, 
  List, 
  Zap, 
  Cpu, 
  Database, 
  RefreshCw, 
  AlignLeft, 
  Activity, 
  Terminal as TerminalIcon, 
  Triangle, 
  Search,
  CheckSquare,
  Square,
  ArrowUpDown,
  FileJson,
  Layers,
  Zap as ZapIcon,
  Brain,
  ChevronRight,
  ShieldCheck,
  Lock,
  HardDrive,
  Settings,
  Github,
  Cloud,
  ClipboardCheck,
  Code,
  Terminal,
  BookOpen,
  Fingerprint,
  Monitor,
  Box,
  Globe,
  Database as DbIcon,
  Cpu as CpuIcon,
  Key,
  Server,
  Workflow,
  Shield,
  FileCode,
  AlertCircle,
  ExternalLink,
  Info,
  Check,
  Copy,
  Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { extractProductsFromImage, normalizeProductData } from './services/geminiService';
import { Product, ProcessingFile, ExtractionStatus } from './types';
import PlexusBackground from './PlexusBackground';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'main' | 'about'>('main');
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [extractedProducts, setExtractedProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<ExtractionStatus>(ExtractionStatus.IDLE);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: keyof Product; direction: 'asc' | 'desc' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef<boolean>(false);
  const abortIdRef = useRef<number>(0);

  const cleanPrice = (price: string | undefined): string => {
    if (!price) return '';
    const p = price.trim().toUpperCase();
    const placeholders = ['N/A', '0', 'R0', 'NULL', 'NONE', '-', 'N.A', 'N/A.', 'ZERO', 'TBA'];
    if (placeholders.includes(p)) return '';
    return price.trim();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        status: 'pending' as const,
        progress: 0
      }));
      setFiles(prev => [...prev, ...newFiles]);
      setErrorMessage(null);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const resetTerminal = () => {
    abortIdRef.current += 1;
    isProcessingRef.current = false;
    setFiles([]);
    setExtractedProducts([]);
    setStatus(ExtractionStatus.IDLE);
    setErrorMessage(null);
    setSelectedIds(new Set());
    setSearchQuery('');
  };

  const updateProduct = (id: string, field: keyof Product, value: string) => {
    setExtractedProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredProducts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  const deleteSelected = () => {
    setExtractedProducts(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  };

  const processAllFiles = async () => {
    if (files.length === 0 || status === ExtractionStatus.PROCESSING) return;
    const currentAbortId = abortIdRef.current;
    setStatus(ExtractionStatus.PROCESSING);
    isProcessingRef.current = true;
    setErrorMessage(null);

    for (const processingFile of files) {
      if (abortIdRef.current !== currentAbortId) return;
      if (processingFile.status === 'completed') continue;

      try {
        setFiles(prev => prev.map(f => f.id === processingFile.id ? { ...f, status: 'processing', progress: 5 } : f));
        const fileName = processingFile.file.name.toLowerCase();
        const allExtracted: Product[] = [];

        if (fileName.endsWith('.pdf')) {
          const arrayBuffer = await processingFile.file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          const totalPages = pdf.numPages;
          
          for (let i = 1; i <= totalPages; i++) {
            if (abortIdRef.current !== currentAbortId) return;
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 3.5 }); 
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) continue;
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport, canvas: canvas } as any).promise;
            const base64Image = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
            const extracted = await extractProductsFromImage(base64Image);
            if (abortIdRef.current !== currentAbortId) return;
            const pageProducts = (extracted || []).map(item => ({
              id: Math.random().toString(36).substr(2, 9),
              sku: item.sku || '',
              description: item.description || '',
              normalPrice: cleanPrice(item.normalPrice),
              specialPrice: cleanPrice(item.specialPrice),
              brand: processingFile.file.name.split('.')[0],
              fileName: processingFile.file.name
            }));
            allExtracted.push(...pageProducts);
            const progressPercent = Math.round((i / totalPages) * 100);
            setFiles(prev => prev.map(f => f.id === processingFile.id ? { ...f, progress: progressPercent } : f));
          }
        } else if (/\.(xlsx|xls|csv)$/i.test(fileName)) {
          const arrayBuffer = await processingFile.file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          const CHUNK_SIZE = 40; 
          for (let i = 0; i < jsonData.length; i += CHUNK_SIZE) {
            if (abortIdRef.current !== currentAbortId) return;
            const chunk = jsonData.slice(i, i + CHUNK_SIZE);
            const normalized = await normalizeProductData(JSON.stringify(chunk));
            const products = (normalized || []).map(item => ({
              id: Math.random().toString(36).substr(2, 9),
              sku: item.sku || '',
              description: item.description || '',
              normalPrice: cleanPrice(item.normalPrice),
              specialPrice: cleanPrice(item.specialPrice),
              brand: processingFile.file.name.split('.')[0],
              fileName: processingFile.file.name
            }));
            allExtracted.push(...products);
            const progressPercent = Math.round((Math.min(i + CHUNK_SIZE, jsonData.length) / jsonData.length) * 100);
            setFiles(prev => prev.map(f => f.id === processingFile.id ? { ...f, progress: progressPercent } : f));
          }
        }
        
        if (abortIdRef.current === currentAbortId) {
          setExtractedProducts(prev => [...prev, ...allExtracted]);
          setFiles(prev => prev.map(f => f.id === processingFile.id ? { ...f, status: 'completed', progress: 100, extractedCount: allExtracted.length } : f));
        }
      } catch (err: any) {
        if (err.message?.includes("quota") || err.status === 429) {
          setErrorMessage("Rate Limit or API Error. Try adding more keys in deployment.");
          setStatus(ExtractionStatus.IDLE);
          isProcessingRef.current = false;
          return;
        }
        setFiles(prev => prev.map(f => f.id === processingFile.id ? { ...f, status: 'error', error: 'Extraction Failure' } : f));
      }
    }
    if (abortIdRef.current === currentAbortId) {
      setStatus(ExtractionStatus.COMPLETED);
      isProcessingRef.current = false;
    }
  };

  const exportToExcel = (dataToExport?: Product[]) => {
    const list = dataToExport || (selectedIds.size > 0 ? extractedProducts.filter(p => selectedIds.has(p.id)) : extractedProducts);
    if (list.length === 0) return;
    const worksheetData = list.map((p) => ({
      "SKU": p.sku, 
      "DESCRIPTION": p.description, 
      "PRICE": p.normalPrice, 
      "PROMO": p.specialPrice,
      "BRAND/FILE": p.brand
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const colWidths = [{ wch: 20 }, { wch: 60 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    worksheet['!cols'] = colWidths;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Extraction_Master");
    XLSX.writeFile(workbook, `Batch_Extract_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filteredProducts = useMemo(() => {
    let result = extractedProducts;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.sku.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) || 
        p.brand.toLowerCase().includes(q)
      );
    }
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [extractedProducts, searchQuery, sortConfig]);

  const handleSort = (key: keyof Product) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(label);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#020305] text-slate-300 antialiased font-sans selection:bg-blue-600/30 overflow-hidden">
      <PlexusBackground isProcessing={status === ExtractionStatus.PROCESSING} />

      <nav className="fixed top-0 left-0 right-0 h-14 border-b border-white/[0.03] bg-[#020305]/60 backdrop-blur-3xl z-[100] px-4">
        <div className="max-w-[120rem] mx-auto h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-700 to-blue-500 flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                <AlignLeft className="w-5 h-5 text-white" />
             </div>
             <div className="flex flex-col">
               <span className="text-lg font-black text-white tracking-tighter uppercase leading-none italic">Batch<span className="text-blue-500">Extract</span></span>
               <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest mt-0.5">Neural Cluster V3.5</span>
             </div>
          </div>
          
          <div className="flex bg-white/[0.02] p-0.5 rounded-xl border border-white/[0.03]">
            <button 
              onClick={() => setActiveTab('main')}
              className={`px-6 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'main' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <TerminalIcon className="w-3 h-3" />
              Terminal
            </button>
            <button 
              onClick={() => setActiveTab('about')}
              className={`px-6 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'about' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Cloud className="w-3 h-3" />
              Deploy Docs
            </button>
          </div>

          <div className="flex items-center gap-4">
             <button onClick={resetTerminal} className="p-2 bg-slate-900/40 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg border border-white/[0.03] hover:border-red-500/20 transition-all flex items-center gap-2 group">
                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-[8px] font-black uppercase tracking-widest">Clear</span>
             </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-16 pb-14 px-4 h-screen flex flex-col">
        {activeTab === 'main' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-4 h-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
               {[
                 { label: "Extraction", val: status === ExtractionStatus.PROCESSING ? "Active" : "Idle", icon: <Zap className="text-yellow-500" />, color: "text-blue-400" },
                 { label: "Database", val: extractedProducts.length, icon: <Database className="text-blue-500" />, color: "text-blue-400" },
                 { label: "Queue", val: files.length, icon: <FileText className="text-purple-500" />, color: "text-blue-400" },
                 { label: "Cluster Status", val: "Optimized", icon: <Layers className="text-emerald-500" />, color: "text-blue-400" }
               ].map((stat, i) => (
                 <div key={i} className="bg-white/[0.01] border border-white/[0.03] rounded-2xl p-3 flex items-center gap-4 group hover:bg-white/[0.02] transition-all">
                    <div className="w-10 h-10 rounded-xl bg-slate-900/50 border border-white/[0.03] flex items-center justify-center group-hover:scale-105 transition-transform">
                       {React.cloneElement(stat.icon as React.ReactElement<any>, { className: 'w-5 h-5' })}
                    </div>
                    <div>
                       <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
                       <p className="text-sm font-black text-white tracking-tighter">{stat.val}</p>
                    </div>
                 </div>
               ))}
            </div>

            <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden mb-2">
              <div className="lg:w-72 flex flex-col gap-4 shrink-0 overflow-hidden">
                <div className="bg-[#0b0e14]/40 border border-white/[0.03] rounded-3xl p-4 flex flex-col shadow-2xl overflow-hidden backdrop-blur-3xl h-full">
                  <h2 className="text-[9px] font-black text-white uppercase tracking-widest italic flex items-center gap-2 mb-4">
                    <Upload className="w-3 h-3 text-blue-500" /> Ingestion Queue
                  </h2>

                  <div 
                    onClick={() => fileInputRef.current?.click()} 
                    className="border border-dashed border-white/[0.05] rounded-2xl p-4 text-center hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group relative"
                  >
                    <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" multiple accept=".pdf,.xlsx,.xls,.csv" />
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-2 border border-white/[0.03] group-hover:scale-110 transition-all">
                      <Plus className="w-5 h-5 text-blue-500" />
                    </div>
                    <p className="text-[9px] font-black text-white tracking-tight uppercase">Upload Assets</p>
                  </div>

                  <div className="mt-4 flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
                    {files.map(f => (
                      <div key={f.id} className={`p-3 rounded-xl border transition-all duration-300 ${f.status === 'processing' ? 'bg-blue-600/5 border-blue-500/30' : 'bg-white/[0.01] border-white/[0.03]'}`}>
                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                           <div className="flex items-center gap-2 min-w-0">
                             <FileText className={`w-3.5 h-3.5 shrink-0 ${f.status === 'completed' ? 'text-emerald-500' : 'text-slate-500'}`} />
                             <span className="text-[9px] font-bold text-slate-300 truncate">{f.file.name}</span>
                           </div>
                           {status !== ExtractionStatus.PROCESSING && (
                             <button onClick={() => removeFile(f.id)} className="p-1 text-slate-600 hover:text-red-400 transition-all shrink-0">
                              <Trash2 className="w-3 h-3" />
                             </button>
                           )}
                        </div>
                        {f.status === 'processing' && (
                          <div className="h-0.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${f.progress}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/[0.03]">
                    <button 
                      onClick={processAllFiles} 
                      disabled={files.length === 0 || status === ExtractionStatus.PROCESSING} 
                      className={`w-full py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 ${status === ExtractionStatus.PROCESSING ? 'bg-blue-600 text-white animate-pulse' : 'bg-white text-black hover:bg-blue-500 hover:text-white disabled:bg-slate-900 disabled:text-slate-700'}`}
                    >
                      {status === ExtractionStatus.PROCESSING ? <Loader2 className="w-3 h-3 animate-spin" /> : <ZapIcon className="w-3 h-3" />}
                      {status === ExtractionStatus.PROCESSING ? 'Processing' : 'Initialize'}
                    </button>
                    {errorMessage && <p className="mt-2 text-[8px] text-red-500 font-black uppercase text-center">{errorMessage}</p>}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-[#0b0e14]/40 border border-white/[0.03] rounded-3xl shadow-2xl overflow-hidden backdrop-blur-3xl min-h-0">
                <div className="p-3 border-b border-white/[0.03] flex items-center justify-between gap-4 shrink-0">
                   <div className="flex items-center gap-4 flex-1">
                      <div className="relative flex-1 max-w-sm group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                        <input 
                          type="text" 
                          placeholder="Search Extracted Matrix..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-slate-900/50 border border-white/[0.03] rounded-xl py-2 pl-9 pr-3 text-[10px] font-bold text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500/30 transition-all"
                        />
                      </div>
                      <div className="flex bg-slate-900 p-0.5 rounded-lg border border-white/[0.03] shrink-0">
                        <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}><List className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
                      </div>
                   </div>

                   <div className="flex items-center gap-2">
                      <button 
                        onClick={() => exportToExcel()} 
                        disabled={extractedProducts.length === 0} 
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-900 disabled:text-slate-700 text-white rounded-xl font-black text-[8px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg"
                      >
                        <Download className="w-3.5 h-3.5" /> Download (.xlsx)
                      </button>
                   </div>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar pb-10">
                  {filteredProducts.length > 0 ? (
                    viewMode === 'table' ? (
                      <table className="w-full text-left border-collapse table-fixed">
                        <thead className="sticky top-0 bg-[#0b0e14] z-20 shadow-sm border-b border-white/[0.03]">
                          <tr>
                            <th className="w-12 px-4 py-3 text-center">
                               <button onClick={selectAll} className={`transition-all ${selectedIds.size === filteredProducts.length ? 'text-blue-500' : 'text-slate-800'}`}>
                                  {selectedIds.size === filteredProducts.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                               </button>
                            </th>
                            <th className="w-40 px-4 py-3 text-[8px] font-black text-slate-600 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('sku')}>
                               <div className="flex items-center gap-2">SKU <ArrowUpDown className="w-2.5 h-2.5" /></div>
                            </th>
                            <th className="px-4 py-3 text-[8px] font-black text-slate-600 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('description')}>
                               <div className="flex items-center gap-2">Description <ArrowUpDown className="w-2.5 h-2.5" /></div>
                            </th>
                            <th className="w-28 px-4 py-3 text-[8px] font-black text-slate-600 uppercase tracking-widest text-right">Standard</th>
                            <th className="w-28 px-4 py-3 text-[8px] font-black text-emerald-600 uppercase tracking-widest text-right">Promo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.01]">
                          {filteredProducts.map(p => (
                            <tr key={p.id} className={`group ${selectedIds.has(p.id) ? 'bg-blue-600/5' : 'hover:bg-white/[0.01]'} transition-colors duration-200`}>
                              <td className="px-4 py-2 text-center">
                                 <button onClick={() => toggleSelect(p.id)} className={`transition-all ${selectedIds.has(p.id) ? 'text-blue-500' : 'text-slate-800'}`}>
                                    {selectedIds.has(p.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                 </button>
                              </td>
                              <td className="px-4 py-2">
                                <input value={p.sku} onChange={(e) => updateProduct(p.id, 'sku', e.target.value)} className="w-full bg-transparent border-none text-[9px] font-black text-blue-500 font-mono focus:outline-none" />
                              </td>
                              <td className="px-4 py-2">
                                <textarea value={p.description} onChange={(e) => updateProduct(p.id, 'description', e.target.value)} className="w-full bg-transparent border-none text-[9px] font-bold text-slate-400 resize-none focus:outline-none focus:text-slate-200" rows={1} />
                              </td>
                              <td className="px-4 py-2">
                                <input value={p.normalPrice} onChange={(e) => updateProduct(p.id, 'normalPrice', e.target.value)} className="w-full bg-transparent border-none text-[9px] font-black text-slate-500 text-right focus:outline-none focus:text-white" />
                              </td>
                              <td className="px-4 py-2">
                                <input value={p.specialPrice} onChange={(e) => updateProduct(p.id, 'specialPrice', e.target.value)} className="w-full bg-transparent border-none text-[10px] font-black text-emerald-500 text-right focus:outline-none" placeholder="---" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {filteredProducts.map(p => (
                          <div key={p.id} className={`relative bg-white/[0.01] border rounded-2xl p-4 hover:border-blue-500/20 transition-all ${selectedIds.has(p.id) ? 'border-blue-500/40 bg-blue-600/5' : 'border-white/[0.03]'}`}>
                             <button onClick={() => toggleSelect(p.id)} className={`absolute top-3 right-3 transition-all ${selectedIds.has(p.id) ? 'text-blue-500' : 'text-slate-800'}`}>
                                <CheckSquare className="w-3.5 h-3.5" />
                             </button>
                             <div className="mb-2">
                                <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">{p.sku || "N/A"}</span>
                             </div>
                             <textarea value={p.description} onChange={(e) => updateProduct(p.id, 'description', e.target.value)} className="w-full bg-transparent border-none text-[10px] font-bold text-slate-300 mb-3 resize-none focus:outline-none" rows={2} />
                             <div className="flex justify-between items-center text-[9px] font-black border-t border-white/[0.03] pt-2">
                                <span className="text-slate-600 uppercase">R {p.normalPrice || '0.00'}</span>
                                <span className="text-emerald-500 uppercase">R {p.specialPrice || '0.00'}</span>
                             </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale p-8 text-center pointer-events-none">
                       <Triangle className="w-12 h-12 text-blue-500 mb-4 animate-pulse" />
                       <h3 className="text-xl font-black text-white uppercase tracking-[0.3em]">System Standby</h3>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in-95 duration-500 h-full overflow-y-auto custom-scrollbar px-4 pb-20">
            <div className="max-w-6xl mx-auto space-y-12 pt-8">
              
              <div className="bg-gradient-to-br from-[#0b0e14] to-[#020305] border border-white/[0.03] rounded-[3rem] p-12 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[100px] rounded-full"></div>
                 <div className="relative z-10">
                   <h1 className="text-5xl font-black text-white italic tracking-tighter uppercase mb-6">Deployment<span className="text-blue-500"> Blueprint</span></h1>
                   <p className="text-slate-400 text-lg font-medium italic max-w-2xl leading-relaxed mb-10">
                     A professional guide to launching your private instance of BatchExtract Pro on GitHub and Vercel. Follow these steps to secure your environment and scale your data processing.
                   </p>
                   
                   <div className="flex flex-wrap gap-4">
                      <button 
                        onClick={async () => { // @ts-ignore
                         await window.aistudio.openSelectKey(); resetTerminal(); }}
                        className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-3 shadow-xl"
                      >
                        <Key className="w-4 h-4" /> Setup Local Key
                      </button>
                      <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="px-8 py-4 bg-slate-900 border border-white/[0.03] text-slate-400 hover:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-3">
                         <ExternalLink className="w-4 h-4" /> Billing Info
                      </a>
                   </div>
                 </div>
              </div>

              <div className="space-y-16">
                 
                 {/* PHASE 01 */}
                 <div className="relative">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                          <Terminal className="w-6 h-6" />
                       </div>
                       <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Phase 01: <span className="text-blue-500">Local Scaffolding</span></h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                       <div className="bg-[#0b0e14]/40 p-8 rounded-[2rem] border border-white/[0.03]">
                          <p className="text-sm text-slate-400 font-bold italic mb-6">1. Initialize your project directory and core dependencies.</p>
                          <div className="space-y-4">
                             {[
                               "mkdir batchextract-pro",
                               "cd batchextract-pro",
                               "git init",
                               "npm install @google/genai lucide-react xlsx pdfjs-dist"
                             ].map((cmd, i) => (
                               <div key={i} className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/[0.02] group">
                                  <code className="text-blue-400 text-[11px] font-mono">{cmd}</code>
                                  <button onClick={() => copyToClipboard(cmd, `CMD_${i}`)} className="text-slate-600 hover:text-white transition-all"><Copy className="w-3.5 h-3.5" /></button>
                               </div>
                             ))}
                          </div>
                       </div>
                       <div className="bg-blue-600/5 p-8 rounded-[2rem] border border-blue-500/10 flex flex-col justify-center">
                          <h4 className="text-xs font-black text-white uppercase mb-4 flex items-center gap-2">
                             <Monitor className="w-4 h-4 text-blue-500" /> Bulk Command
                          </h4>
                          <p className="text-[11px] text-slate-500 italic mb-6">Copy and paste this entire block into your terminal to speed up the process.</p>
                          <button 
                            onClick={() => copyToClipboard('mkdir batchextract-pro\ncd batchextract-pro\ngit init\nnpm install @google/genai lucide-react xlsx pdfjs-dist', 'Phase 1 Bulk')}
                            className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-blue-400 border border-blue-500/20 rounded-xl font-mono text-[10px] flex items-center justify-between px-6 group"
                          >
                             <span>[COPY ALL PHASE 01]</span>
                             <Code className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          </button>
                       </div>
                    </div>
                 </div>

                 {/* PHASE 02 */}
                 <div className="relative">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white border border-white/10">
                          <Github className="w-6 h-6" />
                       </div>
                       <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Phase 02: <span className="text-white">Git Synchronization</span></h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                       <div className="space-y-6">
                          <div className="p-6 bg-[#0b0e14]/40 border border-white/[0.03] rounded-3xl">
                             <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">A. Remote Connection</h4>
                             <p className="text-[11px] text-slate-500 italic leading-relaxed mb-4">
                                Create a new repository on GitHub (Private recommended). Copy the Remote URL and run:
                             </p>
                             <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/[0.02]">
                                <code className="text-emerald-400 text-[10px] font-mono">git remote add origin YOUR_URL_HERE</code>
                             </div>
                          </div>
                          <div className="p-6 bg-[#0b0e14]/40 border border-white/[0.03] rounded-3xl">
                             <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">B. Initial Push</h4>
                             <p className="text-[11px] text-slate-500 italic mb-4">Push your source code to the main branch.</p>
                             <div className="space-y-3">
                                <code className="block p-2 bg-black/20 text-[10px] text-slate-400 rounded">git add .</code>
                                <code className="block p-2 bg-black/20 text-[10px] text-slate-400 rounded">git commit -m "Initialize V3.5 Core"</code>
                                <code className="block p-2 bg-black/20 text-[10px] text-slate-400 rounded">git push -u origin main</code>
                             </div>
                          </div>
                       </div>
                       <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 flex flex-col items-center justify-center text-center">
                          <Shield className="w-12 h-12 text-white/20 mb-6" />
                          <h4 className="text-xs font-black text-white uppercase mb-2">Security Protocol</h4>
                          <p className="text-[10px] text-slate-500 font-bold italic max-w-xs">Ensure your .gitignore includes node_modules and .env files before pushing to any public repository.</p>
                       </div>
                    </div>
                 </div>

                 {/* PHASE 03 */}
                 <div className="relative">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                          <Cloud className="w-6 h-6" />
                       </div>
                       <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Phase 03: <span className="text-blue-500">Vercel Scaling</span></h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                       <div className="bg-slate-900/50 p-8 rounded-[3rem] border border-white/5 space-y-6">
                          <div className="flex items-center gap-3">
                             <Settings className="w-5 h-5 text-blue-500" />
                             <h4 className="text-xs font-black text-white uppercase">Industrial Key Scaling</h4>
                          </div>
                          <p className="text-[11px] text-slate-500 italic leading-relaxed">
                             To prevent "429 Rate Limit" errors during massive batch extractions, our engine supports up to 5 rotating API keys.
                          </p>
                          
                          <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 space-y-4">
                             <div className="flex items-center justify-between border-b border-blue-500/10 pb-2">
                                <span className="text-[9px] font-black text-blue-400">VAR NAME</span>
                                <span className="text-[9px] font-black text-slate-500 uppercase">Recommended Usage</span>
                             </div>
                             <div className="space-y-2">
                                <div className="flex justify-between font-mono text-[10px]">
                                   <span className="text-white">API_KEY</span>
                                   <span className="text-emerald-500 italic">Primary (Required)</span>
                                </div>
                                <div className="flex justify-between font-mono text-[10px]">
                                   <span className="text-white">API_KEY_2</span>
                                   <span className="text-blue-400/50 italic">Secondary (Optional)</span>
                                </div>
                                <div className="flex justify-between font-mono text-[10px]">
                                   <span className="text-white">API_KEY_3</span>
                                   <span className="text-blue-400/50 italic">Tertiary (Optional)</span>
                                </div>
                                <div className="flex justify-between font-mono text-[10px]">
                                   <span className="text-white">API_KEY_4</span>
                                   <span className="text-blue-400/50 italic">Extended (Optional)</span>
                                </div>
                                <div className="flex justify-between font-mono text-[10px]">
                                   <span className="text-white">API_KEY_5</span>
                                   <span className="text-blue-400/50 italic">Exhaustive (Optional)</span>
                                </div>
                             </div>
                          </div>
                       </div>

                       <div className="flex flex-col justify-center gap-6">
                          <div className="p-6 bg-[#0b0e14]/40 border border-white/[0.03] rounded-3xl">
                             <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-3">Setup Instructions</h4>
                             <ol className="text-[11px] text-slate-500 space-y-3 font-bold italic">
                                <li>1. In Vercel, go to <strong>Project Settings &rarr; Environment Variables</strong>.</li>
                                <li>2. Add each key as a new variable using the names above.</li>
                                <li>3. Hit <strong>Redeploy</strong> to activate the Neural Rotation cluster.</li>
                             </ol>
                          </div>
                          <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl flex items-start gap-4">
                             <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                             <div>
                                <h5 className="text-[10px] font-black text-white uppercase mb-1">Success Criteria</h5>
                                <p className="text-[9px] text-slate-500 font-bold italic leading-relaxed">The engine will automatically detect additional keys and rotate them to provide up to 5x the throughput of a single-key setup.</p>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

              </div>

              <div className="flex flex-col items-center py-20 gap-8">
                 <div className="h-px w-20 bg-white/10"></div>
                 <p className="text-[9px] text-slate-800 font-black uppercase tracking-[1.5em]">SYSTEM CONFIGURATION COMPLETE</p>
                 <button 
                  onClick={() => setActiveTab('main')}
                  className="px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-[0_0_30px_rgba(37,99,235,0.4)] active:scale-95 flex items-center gap-3"
                 >
                   Return to Terminal <TerminalIcon className="w-4 h-4" />
                 </button>
              </div>

            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 py-2 h-10 border-t border-white/[0.03] bg-[#020305]/80 backdrop-blur-xl z-[100] pointer-events-none">
        <div className="max-w-[120rem] mx-auto h-full px-4 flex justify-between items-center text-[7px] font-black text-slate-700 uppercase tracking-widest">
           <span>BatchExtract Pro Labs 2025</span>
           <div className="flex gap-4">
              <span>Cluster V3.5 Stable</span>
              <span className={status === ExtractionStatus.PROCESSING ? 'text-emerald-500' : 'text-slate-700'}>
                {status === ExtractionStatus.PROCESSING ? 'Inference Active' : 'Standby Mode'}
              </span>
           </div>
        </div>
      </footer>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.3);
        }
      `}</style>
    </div>
  );
};

export default App;
