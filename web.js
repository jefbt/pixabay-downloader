import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  Download, 
  Settings, 
  Clock, 
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Play,
  Pause,
  Save,
  FileUp,
  FileDown,
  CheckCircle2,
  Trash2,
  RefreshCw,
  ArrowDownCircle,
  Layers,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

/**
 * Pixabay Video Downloader - Versão Otimizada (Paginação Real)
 * Foco: Baixo consumo de memória, descarregando páginas anteriores.
 */

const App = () => {
  // Estados principais
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('pixabay_api_key') || '');
  const [query, setQuery] = useState('natureza');
  const [videos, setVideos] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Estado para rastrear downloads individuais em processamento
  const [processingIds, setProcessingIds] = useState(new Set());

  // Histórico de Downloads
  const [downloadedIds, setDownloadedIds] = useState(() => {
    const saved = localStorage.getItem('pixabay_download_history');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Configurações de Download em Série
  const [batchDelay, setBatchDelay] = useState(3); // segundos
  const [autoNextPage, setAutoNextPage] = useState(true); // Se deve ir para próx página
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const stopBatchRef = useRef(false);

  // Ref para rastrear promessas de play
  const playPromises = useRef({});

  // Persistir API Key e Histórico
  useEffect(() => {
    localStorage.setItem('pixabay_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('pixabay_download_history', JSON.stringify(Array.from(downloadedIds)));
  }, [downloadedIds]);

  /**
   * Helper interno para buscar dados
   */
  const fetchPixabayData = async (pageNum, searchQuery) => {
    const params = new URLSearchParams({
      key: apiKey,
      q: searchQuery,
      per_page: 200, // Máximo permitido
      safesearch: 'true',
      page: pageNum
    });

    const response = await fetch(`https://pixabay.com/api/videos/?${params.toString()}`);
    if (!response.ok) {
      if (response.status === 400) throw new Error("Requisição inválida. Verifique sua chave de API.");
      if (response.status === 429) throw new Error("Limite de requisições excedido. Aguarde um momento.");
      throw new Error(`Erro ${response.status}: Falha ao buscar vídeos`);
    }
    return await response.json();
  };

  /**
   * Função Centralizada de Carregamento de Página
   * Substitui os vídeos atuais pelos novos para economizar memória.
   */
  const loadPage = useCallback(async (pageNum, isNewSearch = false) => {
    if (!apiKey) {
      setError("Por favor, insira sua chave de API do Pixabay nas configurações.");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setError(null);
    
    // Se for nova busca, limpa imediatamente para feedback visual
    if (isNewSearch) {
      setVideos([]);
      setPage(1);
    }

    try {
      const data = await fetchPixabayData(pageNum, query);

      if (data.hits) {
        // AQUI ESTÁ A MUDANÇA: Substituímos o array (setVideos) em vez de adicionar (...prev)
        setVideos(data.hits);
        setPage(pageNum);
      } else {
        setVideos([]);
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, query]);

  // Wrapper para o botão de busca
  const handleSearch = () => loadPage(1, true);

  // Wrapper para paginação manual
  const changePage = (delta) => {
    const newPage = Math.max(1, page + delta);
    loadPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Carregar automaticamente ao iniciar se houver dados
  useEffect(() => {
    if (apiKey && query && videos.length === 0) {
      // Opcional
    }
  }, []);

  const triggerDownload = async (video) => {
    const videoId = video.id;
    const videoUrl = video.videos.large?.url || video.videos.medium?.url || video.videos.tiny?.url;
    
    if (!videoUrl) return;

    const filename = `pixabay-${videoId}-full.mp4`;
    setProcessingIds(prev => new Set(prev).add(videoId));

    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error("Falha no download");
      
      const videoBlob = await response.blob();
      const blobUrl = window.URL.createObjectURL(videoBlob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(blobUrl);
      setDownloadedIds(prev => new Set(prev).add(videoId));

    } catch (err) {
      console.error("Erro download blob, fallback nova aba:", err);
      window.open(videoUrl, '_blank');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  };

  /**
   * Lógica de Download em Lote com Paginação Automática
   */
  const startBatchDownload = async () => {
    setIsBatchDownloading(true);
    stopBatchRef.current = false;
    setError(null);

    let currentPageNum = page;
    let currentVideosList = videos; // Começa com o que já está na tela
    let hasMorePages = true;

    while (hasMorePages && !stopBatchRef.current) {
      
      // 1. Identificar o que baixar na lista atual
      const toDownload = currentVideosList.filter(v => !downloadedIds.has(v.id));
      
      setBatchTotal(toDownload.length);
      setCurrentBatchIndex(0);

      if (toDownload.length === 0 && !autoNextPage) {
        setError("Todos os vídeos da página atual já foram baixados.");
        break;
      }

      // 2. Processar a lista atual
      for (let i = 0; i < toDownload.length; i++) {
        if (stopBatchRef.current) break;

        setCurrentBatchIndex(i + 1);
        try {
          await triggerDownload(toDownload[i]);
        } catch (e) {
          console.error(`Falha lote ${toDownload[i].id}`, e);
        }

        // Delay entre downloads
        if (i < toDownload.length - 1 && !stopBatchRef.current) {
          await new Promise(resolve => setTimeout(resolve, batchDelay * 1000));
        }
      }

      if (stopBatchRef.current) break;

      // 3. Avançar para próxima página (limpando a anterior)
      if (autoNextPage) {
        // Pausa para "respirar"
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          currentPageNum++;
          // Busca próxima página
          const data = await fetchPixabayData(currentPageNum, query);
          
          if (!data.hits || data.hits.length === 0) {
            hasMorePages = false;
          } else {
            // SUBSTITUI A LISTA (Limpa memória da pág anterior)
            setVideos(data.hits);
            setPage(currentPageNum);
            currentVideosList = data.hits; 
            
            // Scroll para topo para mostrar que mudou de página
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } catch (err) {
          console.error("Erro paginação auto:", err);
          setError("Erro ao buscar próxima página. O download parou.");
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }

    setIsBatchDownloading(false);
  };

  const stopBatchDownload = () => {
    stopBatchRef.current = true;
    setIsBatchDownloading(false);
  };

  const exportHistory = () => {
    const dataStr = JSON.stringify(Array.from(downloadedIds));
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'pixabay-history.json');
    linkElement.click();
  };

  const importHistory = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (Array.isArray(json)) {
          setDownloadedIds(prev => new Set([...prev, ...json]));
          setError(null);
        }
      } catch (err) {
        setError("Erro ao importar JSON.");
      }
    };
    reader.readAsText(file);
  };

  const clearHistory = () => {
    if (confirm("Apagar histórico de downloads?")) {
      setDownloadedIds(new Set());
    }
  };

  const handleVideoMouseOver = (videoId, videoElement) => {
    const promise = videoElement.play();
    if (promise !== undefined) {
      playPromises.current[videoId] = promise;
      promise.catch(() => {});
    }
  };

  const handleVideoMouseOut = (videoId, videoElement) => {
    const promise = playPromises.current[videoId];
    if (promise !== undefined) {
      promise.then(() => {
        videoElement.pause();
        videoElement.currentTime = 0;
        delete playPromises.current[videoId];
      }).catch(() => {
        videoElement.pause();
        videoElement.currentTime = 0;
        delete playPromises.current[videoId];
      });
    } else {
      videoElement.pause();
      videoElement.currentTime = 0;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Pixabay Video Hunter
              </h1>
              <p className="text-slate-400 text-sm mt-1">Busca Direta & Download em Massa</p>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-3 rounded-xl transition-all ${showSettings ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                title="Configurações"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>

          {/* Barra de Busca Grande */}
          <div className="relative w-full">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Digite o tema (ex: natureza, drone, tecnologia)..."
              className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 pl-14 pr-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-lg shadow-xl"
            />
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={24} />
            <button 
              onClick={handleSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-500/20"
            >
              Buscar
            </button>
          </div>
        </header>

        {/* Configurações & Dados */}
        {showSettings && (
          <div className="mb-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-indigo-400 mb-2">
                  <ShieldCheck size={18} />
                  <h3 className="font-bold">Credenciais Pixabay</h3>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase mb-1 block">API Key</label>
                  <input 
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Cole sua API Key aqui..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                  <a href="https://pixabay.com/api/docs/" target="_blank" className="text-xs text-indigo-400 hover:underline mt-1 block">Obter chave gratuita</a>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Delay (seg)</label>
                    <input 
                      type="number"
                      value={batchDelay}
                      onChange={(e) => setBatchDelay(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-800 p-2.5 rounded-xl border border-slate-700 hover:bg-slate-750 transition-colors">
                      <input 
                        type="checkbox"
                        checked={autoNextPage}
                        onChange={(e) => setAutoNextPage(e.target.checked)}
                        className="accent-indigo-500 w-4 h-4"
                      />
                      <span className="text-sm font-medium">Auto-avançar Páginas</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-l border-slate-800 pl-0 md:pl-8">
                 <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <Save size={18} />
                  <h3 className="font-bold">Gerenciar Histórico</h3>
                </div>
                <p className="text-xs text-slate-400">
                  {downloadedIds.size} vídeos marcados como baixados.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={exportHistory} className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
                    <FileDown size={14} /> Exportar
                  </button>
                  <label className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors">
                    <FileUp size={14} /> Importar
                    <input type="file" accept=".json" onChange={importHistory} className="hidden" />
                  </label>
                  <button onClick={clearHistory} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
                    <Trash2 size={14} /> Limpar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Barra de Controle de Lote */}
        <div className="sticky top-4 z-20 mb-6 flex flex-col sm:flex-row items-center gap-4 bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-xl">
          <button 
            disabled={isBatchDownloading || videos.length === 0}
            onClick={startBatchDownload}
            className={`w-full sm:w-auto flex-1 font-bold py-3 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 ${
              isBatchDownloading 
              ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:shadow-emerald-500/20 hover:scale-[1.02] text-white'
            }`}
          >
            {isBatchDownloading ? <Loader2 className="animate-spin" /> : <Layers fill="currentColor" size={20} />}
            {isBatchDownloading ? 'Processando Lote...' : `Baixar Todos (Pág ${page}...)`}
          </button>
          
          {isBatchDownloading && (
            <div className="flex items-center gap-4 flex-1 w-full sm:w-auto">
              <div className="h-2 flex-1 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${batchTotal > 0 ? (currentBatchIndex / batchTotal) * 100 : 0}%` }}
                />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-mono text-emerald-400 whitespace-nowrap">
                  Vídeo {currentBatchIndex} / {batchTotal}
                </span>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Página {page}</span>
              </div>
              <button onClick={stopBatchDownload} className="text-red-400 hover:text-red-300 p-2 bg-red-500/10 rounded-lg">
                <Pause size={18} fill="currentColor" />
              </button>
            </div>
          )}

          {!isBatchDownloading && videos.length > 0 && (
             <div className="flex items-center gap-2 px-2">
                <div className="text-xs text-slate-500 font-medium bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
                  {videos.length} na tela
                </div>
                <div className="text-xs text-slate-500 font-medium bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
                  Página {page}
                </div>
             </div>
          )}
        </div>

        {/* Mensagens de Erro */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-start gap-3 mb-6">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Grid de Vídeos */}
        {loading && videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <Loader2 className="animate-spin text-indigo-500" size={48} />
            <p className="text-slate-400">Carregando vídeos...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-10">
              {videos.map((video, index) => {
                const alreadyDownloaded = downloadedIds.has(video.id);
                const isProcessing = processingIds.has(video.id);
                
                return (
                  <div key={`${video.id}-${index}`} className={`group bg-slate-900 border rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ${alreadyDownloaded ? 'border-slate-800 opacity-60' : 'border-slate-800 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/5'}`}>
                    
                    {/* Thumbnail / Video Preview */}
                    <div className="relative aspect-video bg-black overflow-hidden">
                      <video 
                        className="w-full h-full object-cover"
                        poster={`https://i.vimeocdn.com/video/${video.picture_id}_640x360.jpg`}
                        onMouseOver={e => handleVideoMouseOver(video.id, e.currentTarget)}
                        onMouseOut={e => handleVideoMouseOut(video.id, e.currentTarget)}
                        muted loop playsInline
                        src={video.videos.tiny.url}
                      />
                      
                      {/* Badge de Downloaded */}
                      {alreadyDownloaded && (
                        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] flex items-center justify-center z-10">
                          <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/50 flex items-center gap-2 font-bold text-xs uppercase tracking-wide">
                            <CheckCircle2 size={14} /> Salvo
                          </div>
                        </div>
                      )}

                      {/* Badge de Processando */}
                      {isProcessing && (
                        <div className="absolute inset-0 bg-indigo-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
                          <Loader2 className="animate-spin text-white mb-2" size={24} />
                          <span className="text-[10px] text-white font-bold uppercase tracking-widest">Baixando...</span>
                        </div>
                      )}

                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1">
                        <Clock size={10} /> {video.duration}s
                      </div>
                    </div>

                    {/* Info e Ações */}
                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <div className="flex-1">
                        <p className="text-[10px] text-slate-500 font-mono mb-1">ID: {video.id}</p>
                        <h3 className="text-sm font-medium text-slate-200 line-clamp-1 capitalize" title={video.tags}>
                          {video.tags}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 mt-auto">
                        <button 
                          disabled={isProcessing}
                          onClick={() => triggerDownload(video)}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                            alreadyDownloaded 
                            ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white' 
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                          }`}
                        >
                          <Download size={14} />
                          {alreadyDownloaded ? 'Re-baixar' : 'Download Full'}
                        </button>
                        <a 
                          href={video.pageURL} target="_blank" rel="noopener noreferrer"
                          className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 hover:text-white transition-colors"
                          title="Ver no Pixabay"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Controles de Paginação Manual */}
            {videos.length > 0 && !isBatchDownloading && (
              <div className="flex justify-center items-center gap-4 pb-10">
                <button 
                  onClick={() => changePage(-1)}
                  disabled={page === 1 || loading}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
                >
                  <ChevronLeft /> Anterior
                </button>
                
                <span className="text-slate-400 font-mono font-bold px-4">
                  Página {page}
                </span>

                <button 
                  onClick={() => changePage(1)}
                  disabled={loading || videos.length < 200} // Assume que se tem menos de 200, é a última
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
                >
                  Próxima <ChevronRight />
                </button>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!loading && videos.length === 0 && apiKey && (
          <div className="text-center py-20 text-slate-500">
            <p>Nenhum vídeo encontrado. Tente outro termo de busca.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;