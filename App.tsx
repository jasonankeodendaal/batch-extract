
import React, { useState, useRef, useMemo } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { 
  Upload, 
  FileText, 
  Loader2, 
  Download, 
  Trash2, 
  Database, 
  RefreshCw, 
  Search,
  CheckSquare,
  Square,
  ArrowUpDown,
  Zap as ZapIcon,
  Cloud,
  Cpu,
  ShieldCheck,
  Plus,
  ArrowRight,
  Globe,
  Server,
  Workflow,
  Key,
  Github,
  ExternalLink,
  Monitor
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { extractProductsFromImage, normalizeProductData } from './services/geminiService';
import { Product, ProcessingFile, ExtractionStatus } from './types';
import PlexusBackground from './PlexusBackground';

// Ensure the worker is properly loaded from unpkg
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'main' | 'about'>('main');
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [extractedProducts, setExtractedProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<ExtractionStatus>(ExtractionStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: keyof Product; direction: 'asc' | 'desc' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  const processAllFiles = async () => {
    if (files.length === 0 || status === ExtractionStatus.PROCESSING) return;
    
    const currentAbortId = abortIdRef.current;
    setStatus(ExtractionStatus.PROCESSING);
    setErrorMessage(null);

    try {
      for (const processingFile of files) {
        if (abortIdRef.current !== currentAbortId) return;
        if (processingFile.status === 'completed') continue;

        setFiles(prev => prev.map(f => f.id === processingFile.id ? { ...f, status: 'processing', progress: 5 } : f));
        
        const fileName = processingFile.file.name.toLowerCase();
        const allExtracted: Product[] = [];

        try {
          if (fileName.endsWith('.pdf')) {
            const arrayBuffer = await processingFile.file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            const totalPages = pdf.numPages;
            
            for (let i = 1; i <= totalPages; i++) {
              if (abortIdRef.current !== currentAbortId) return;
              
              const page = await pdf.getPage(i);
              // Scale 2.0 is usually balanced for high OCR quality and performance
              const viewport = page.getViewport({ scale: 2.0 }); 
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (!context) continue;
              
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport }).promise;
              
              const base64Image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
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
            
            const CHUNK_SIZE = 50; 
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
          console.error(`Error processing ${processingFile.file.name}:`, err);
          setFiles(prev => prev.map(f => f.id === processingFile.id ? { ...f, status: 'error', error: 'Extraction Failure' } : f));
        }
      }
      
      if (abortIdRef.current === currentAbortId) {
        setStatus(ExtractionStatus.COMPLETED);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred during processing.");
      setStatus(ExtractionStatus.IDLE);
    }
  };

  const exportToExcel = () => {
    const list = selectedIds.size > 0 
      ? extractedProducts.filter(p => selectedIds.has(p.id)) 
      : extractedProducts;
      
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

  return (
    <div className="min-h-screen bg-[#020305] text-slate-300 antialiased font-sans selection:bg-blue-600/30 overflow-hidden">
      <PlexusBackground isProcessing={status === ExtractionStatus.PROCESSING} />

      <nav className="fixed top-0 left-0 right-0 h-14 border-b border-white/[0.03] bg-[#020305]/80 backdrop-blur-3xl z-[100] px-4">
        <div className="max-w-[120rem] mx-auto h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-700 to-blue-500 flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                <Globe className="w-5 h-5 text-white" />
             </div>
             <div className="flex flex-col">
               <span className="text-lg font-black text-white tracking-tighter uppercase leading-none italic">Batch<span className="text-blue-500">Cloud</span></span>
               <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                 <Server className="w-2 h-2 text-emerald-500" /> Neural Processing Stable
               </span>
             </div>
          </div>
          
          <div className="flex bg-white/[0.02] p-0.5 rounded-xl border border-white/[0.03]">
            <button 
              onClick={() => setActiveTab('main')}
              className={`px-6 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'main' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <ZapIcon className="w-3 h-3" />
              Extractor
            </button>
            <button 
              onClick={() => setActiveTab('about')}
              className={`px-6 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'about' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Cloud className="w-3 h-3" />
              Cloud Setup
            </button>
          </div>

          <div className="flex items-center gap-4">
             <button onClick={resetTerminal} className="p-2 bg-slate-900/40 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg border border-white/[0.03] hover:border-red-500/20 transition-all flex items-center gap-2 group">
                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-[8px] font-black uppercase tracking-widest">Reset</span>
             </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-16 pb-14 px-4 h-screen flex flex-col">
        {activeTab === 'main' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-4 h-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
               {[
                 { label: "Engine Status", val: status === ExtractionStatus.PROCESSING ? "Extracting..." : "Ready", icon: <Cpu className="text-blue-500" /> },
                 { label: "Total Rows", val: extractedProducts.length, icon: <Database className="text-purple-500" /> },
                 { label: "Files Queued", val: files.length, icon: <FileText className="text-yellow-500" /> },
                 { label: "Network", val: "Edge Secure", icon: <ShieldCheck className="text-emerald-500" /> }
               ].map((stat, i) => (
                 <div key={i} className="bg-[#0b0e14]/60 border border-white/[0.03] rounded-2xl p-3 flex items-center gap-4 hover:bg-white/[0.02] transition-all">
                    <div className="w-10 h-10 rounded-xl bg-slate-900/50 border border-white/[0.03] flex items-center justify-center">
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
                <div className="bg-[#0b0e14]/60 border border-white/[0.03] rounded-3xl p-4 flex flex-col shadow-2xl overflow-hidden backdrop-blur-3xl h-full">
                  <h2 className="text-[9px] font-black text-white uppercase tracking-widest italic flex items-center gap-2 mb-4">
                    <Upload className="w-3 h-3 text-blue-500" /> File Ingestion
                  </h2>

                  <div 
                    onClick={() => fileInputRef.current?.click()} 
                    className="border border-dashed border-white/[0.08] rounded-2xl p-6 text-center hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group relative"
                  >
                    <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" multiple accept=".pdf,.xlsx,.xls,.csv" />
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-2 border border-white/[0.03] group-hover:scale-110 transition-all">
                      <Plus className="w-5 h-5 text-blue-500" />
                    </div>
                    <p className="text-[9px] font-black text-white tracking-tight uppercase">Upload PDF / Excel</p>
                    <p className="text-[7px] text-slate-500 mt-1 uppercase font-bold">Automatic brand detection</p>
                  </div>

                  <div className="mt-4 flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
                    {files.map(f => (
                      <div key={f.id} className={`p-3 rounded-xl border transition-all duration-300 ${f.status === 'processing' ? 'bg-blue-600/10 border-blue-500/30' : f.status === 'error' ? 'border-red-500/30 bg-red-500/5' : 'bg-white/[0.01] border-white/[0.03]'}`}>
                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                           <div className="flex items-center gap-2 min-w-0">
                             <FileText className={`w-3.5 h-3.5 shrink-0 ${f.status === 'completed' ? 'text-emerald-500' : f.status === 'error' ? 'text-red-500' : 'text-slate-500'}`} />
                             <span className="text-[9px] font-bold text-slate-300 truncate">{f.file.name}</span>
                           </div>
                           {status !== ExtractionStatus.PROCESSING && (
                             <button onClick={() => removeFile(f.id)} className="p-1 text-slate-600 hover:text-red-400 transition-all shrink-0">
                              <Trash2 className="w-3 h-3" />
                             </button>
                           )}
                        </div>
                        {f.status === 'processing' && (
                          <div className="h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${f.progress}%` }} />
                          </div>
                        )}
                        {f.status === 'error' && <p className="text-[7px] text-red-500 font-bold uppercase mt-1">Error: {f.error}</p>}
                        {f.status === 'completed' && <p className="text-[7px] text-emerald-500 font-bold uppercase mt-1">{f.extractedCount} items found</p>}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/[0.03]">
                    <button 
                      onClick={processAllFiles} 
                      disabled={files.length === 0 || status === ExtractionStatus.PROCESSING} 
                      className={`w-full py-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 ${status === ExtractionStatus.PROCESSING ? 'bg-blue-600 text-white' : 'bg-white text-black hover:bg-blue-500 hover:text-white disabled:bg-slate-900 disabled:text-slate-700'}`}
                    >
                      {status === ExtractionStatus.PROCESSING ? <Loader2 className="w-3 h-3 animate-spin" /> : <ZapIcon className="w-3 h-3" />}
                      {status === ExtractionStatus.PROCESSING ? 'Processing PDF...' : 'Convert to Excel'}
                    </button>
                    {errorMessage && <p className="mt-2 text-[8px] text-red-400 font-black uppercase text-center bg-red-500/10 py-1.5 rounded-md px-2 leading-tight">{errorMessage}</p>}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-[#0b0e14]/60 border border-white/[0.03] rounded-3xl shadow-2xl overflow-hidden backdrop-blur-3xl min-h-0">
                <div className="p-3 border-b border-white/[0.03] flex items-center justify-between gap-4 shrink-0">
                   <div className="flex items-center gap-4 flex-1">
                      <div className="relative flex-1 max-w-sm group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                        <input 
                          type="text" 
                          placeholder="Search SKUs or descriptions..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-slate-900/50 border border-white/[0.03] rounded-xl py-2 pl-9 pr-3 text-[10px] font-bold text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500/30 transition-all"
                        />
                      </div>
                   </div>

                   <div className="flex items-center gap-2">
                      <button 
                        onClick={exportToExcel} 
                        disabled={extractedProducts.length === 0} 
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-900 disabled:text-slate-700 text-white rounded-xl font-black text-[8px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg"
                      >
                        <Download className="w-3.5 h-3.5" /> Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} Excel
                      </button>
                   </div>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                  {filteredProducts.length > 0 ? (
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="sticky top-0 bg-[#0b0e14] z-20 shadow-sm border-b border-white/[0.03]">
                          <tr>
                            <th className="w-12 px-4 py-3 text-center">
                               <button onClick={selectAll} className={`transition-all ${selectedIds.size > 0 && selectedIds.size === filteredProducts.length ? 'text-blue-500' : 'text-slate-800'}`}>
                                  {selectedIds.size > 0 && selectedIds.size === filteredProducts.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                               </button>
                            </th>
                            <th className="w-40 px-4 py-3 text-[8px] font-black text-slate-600 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('sku')}>
                               <div className="flex items-center gap-2">SKU <ArrowUpDown className="w-2.5 h-2.5" /></div>
                            </th>
                            <th className="px-4 py-3 text-[8px] font-black text-slate-600 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('description')}>
                               <div className="flex items-center gap-2">Description <ArrowUpDown className="w-2.5 h-2.5" /></div>
                            </th>
                            <th className="w-28 px-4 py-3 text-[8px] font-black text-slate-600 uppercase tracking-widest text-right">Price</th>
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
                              <td className="px-4 py-2 text-right">
                                <input value={p.normalPrice} onChange={(e) => updateProduct(p.id, 'normalPrice', e.target.value)} className="w-full bg-transparent border-none text-[9px] font-black text-slate-500 text-right focus:outline-none focus:text-white" />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input value={p.specialPrice} onChange={(e) => updateProduct(p.id, 'specialPrice', e.target.value)} className="w-full bg-transparent border-none text-[10px] font-black text-emerald-500 text-right focus:outline-none" placeholder="---" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale p-12 text-center pointer-events-none">
                       <Cloud className="w-16 h-16 text-blue-500 mb-4 animate-bounce" />
                       <h3 className="text-xl font-black text-white uppercase tracking-[0.3em]">Drop PDF Here</h3>
                       <p className="text-[10px] font-bold text-slate-500 uppercase mt-2">Neural engine will extract SKU and Description automatically</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in-95 duration-500 h-full overflow-y-auto custom-scrollbar px-4 pb-20">
            <div className="max-w-5xl mx-auto py-12">
              
              <div className="bg-gradient-to-br from-[#0b0e14] to-black border border-white/[0.05] rounded-[3rem] p-12 text-center relative overflow-hidden mb-12">
                 <div className="absolute inset-0 bg-blue-600/5 blur-[120px] rounded-full -translate-y-1/2"></div>
                 <h1 className="text-6xl font-black text-white italic tracking-tighter uppercase mb-6 relative">Zero-Host <span className="text-blue-500">Cloud Setup</span></h1>
                 <p className="text-slate-400 text-lg font-medium italic max-w-2xl mx-auto leading-relaxed relative">
                   Process unlimited brand pricelists by hosting this utility on Vercel with your own API keys.
                 </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 {[
                   {
                     step: "01",
                     title: "Fork Repository",
                     desc: "Click the 'Fork' button on GitHub to copy this app to your private account.",
                     icon: <Github className="w-6 h-6" />,
                     action: "Fork on GitHub",
                     link: "#"
                   },
                   {
                     step: "02",
                     title: "Connect Vercel",
                     desc: "Log into Vercel and import your new GitHub repository with one click.",
                     icon: <Cloud className="w-6 h-6" />,
                     action: "Import to Vercel",
                     link: "https://vercel.com/new"
                   },
                   {
                     step: "03",
                     title: "Inject API Key",
                     desc: "Add your Gemini API keys as Environment Variables to power the neural engine.",
                     icon: <Key className="w-6 h-6" />,
                     action: "Get Gemini Key",
                     link: "https://aistudio.google.com/app/apikey"
                   }
                 ].map((card, i) => (
                   <div key={i} className="bg-[#0b0e14]/40 border border-white/[0.05] rounded-[2.5rem] p-8 flex flex-col items-center text-center group hover:border-blue-500/30 transition-all">
                      <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
                         {card.icon}
                      </div>
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Step {card.step}</span>
                      <h3 className="text-xl font-black text-white uppercase italic mb-4">{card.title}</h3>
                      <p className="text-xs text-slate-500 font-bold italic leading-relaxed mb-8 flex-1">{card.desc}</p>
                      <a 
                        href={card.link} 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full py-3 bg-white text-black rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-2"
                      >
                         {card.action} <ExternalLink className="w-3 h-3" />
                      </a>
                   </div>
                 ))}
              </div>

              <div className="mt-16 bg-[#0b0e14]/40 border border-white/[0.05] rounded-[3rem] p-10">
                 <div className="flex items-center gap-4 mb-8">
                    <Workflow className="w-6 h-6 text-blue-500" />
                    <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Scaling <span className="text-blue-500">API Capacity</span></h2>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-6">
                       <p className="text-sm text-slate-400 font-bold italic leading-relaxed">
                         The engine requires a valid Gemini API key. Ensure `API_KEY` is set in your environment variables.
                       </p>
                       <div className="bg-black/40 p-6 rounded-2xl border border-white/5 font-mono text-[10px] space-y-3">
                          <p className="text-slate-600">// Vercel Environment Variables</p>
                          <div className="flex justify-between items-center bg-blue-500/5 p-2 rounded">
                             <span className="text-blue-400 font-bold">API_KEY</span>
                             <span className="text-slate-500 italic">Required</span>
                          </div>
                       </div>
                    </div>
                    
                    <div className="bg-blue-600/5 border border-blue-500/10 rounded-3xl p-8 flex flex-col justify-center">
                       <div className="flex items-center gap-3 mb-4">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">Global Extraction</span>
                       </div>
                       <p className="text-xs text-slate-500 font-bold italic leading-relaxed mb-6">
                         Batch extract SKU and Description data from any PDF brand pricelist directly to Excel.
                       </p>
                       <div className="flex gap-4">
                          <div className="px-4 py-2 bg-slate-900 rounded-lg border border-white/5 flex items-center gap-2">
                             <Monitor className="w-3 h-3 text-slate-500" />
                             <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cross-Platform</span>
                          </div>
                          <div className="px-4 py-2 bg-slate-900 rounded-lg border border-white/5 flex items-center gap-2">
                             <Server className="w-3 h-3 text-slate-500" />
                             <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cloud Ready</span>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="text-center mt-12">
                 <button 
                  onClick={() => setActiveTab('main')}
                  className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-2xl active:scale-95 flex items-center gap-3 mx-auto"
                 >
                   Return to Dashboard <ArrowRight className="w-4 h-4" />
                 </button>
              </div>

            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 py-2 h-10 border-t border-white/[0.03] bg-[#020305]/95 backdrop-blur-xl z-[100] pointer-events-none">
        <div className="max-w-[120rem] mx-auto h-full px-4 flex justify-between items-center text-[7px] font-black text-slate-700 uppercase tracking-widest">
           <div className="flex items-center gap-4">
             <span>BatchCloud Protocol V3.6</span>
             <span className="flex items-center gap-1"><Globe className="w-2 h-2" /> Neural Engine Running</span>
           </div>
           <div className="flex gap-4">
              <span className={status === ExtractionStatus.PROCESSING ? 'text-emerald-500' : 'text-slate-700'}>
                {status === ExtractionStatus.PROCESSING ? 'Extracting SKU/DESC Data...' : 'System Idle'}
              </span>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
