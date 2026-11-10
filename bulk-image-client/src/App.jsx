import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import * as signalR from '@microsoft/signalr';
import {
  UploadCloud,
  Sliders,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Download,
  Eye,
  X,
  Layers,
  Sparkles,
  Plus,
  RefreshCw,
  FileCheck,
  Check,
  CheckSquare,
  Square,
  Wand2,
  Contrast,
  Sun,
  Maximize2,
  Minimize2,
  ChevronDown,
  Archive,
  Grid,
  Zap
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000';

export default function App() {
  // 1. Configuración Global del Pipeline
  const [quality, setQuality] = useState(85);
  const [maxConcurrency, setMaxConcurrency] = useState(2); // Concurrencia balanceada
  const [aiModel, setAiModel] = useState('u2netp'); // 'u2netp' (~1.4s ultra rápido) | 'u2net' (~7s precisión)

  // Efectos de Estudio
  const [enableShadow, setEnableShadow] = useState(true);
  const [shadowBlur, setShadowBlur] = useState(18);
  const [shadowOffsetY, setShadowOffsetY] = useState(15);
  const [shadowOpacity, setShadowOpacity] = useState(0.45);
  const [contrast, setContrast] = useState(0); // -50 a +50
  const [brightness, setBrightness] = useState(0); // -50 a +50
  const [paddingPercent, setPaddingPercent] = useState(5); // 0% a 25%
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);

  // Fondo personalizado
  const [bgMode, setBgMode] = useState('transparent'); // 'transparent' | 'custom'
  const [customBgFile, setCustomBgFile] = useState(null);
  const [customBgPreviewUrl, setCustomBgPreviewUrl] = useState(null);

  // Pestañas del Body: 'originals' | 'processed'
  const [activeTab, setActiveTab] = useState('originals');

  // Modo de visualización en galería de tratadas: 'studio' (fondo limpio) | 'grid' (rejilla transparente)
  const [treatedCardBg, setTreatedCardBg] = useState('studio');

  // Imágenes Originales: { id, file, previewUrl, name, size, selected, customConfig }
  const [originalImages, setOriginalImages] = useState([]);

  // Imágenes Tratadas: { originalFileName, webpFileName, url, sizeBytes, selected }
  const [completedImages, setCompletedImages] = useState([]);
  const [errors, setErrors] = useState([]);

  // Estado de SignalR y procesamiento
  const [connectionId, setConnectionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Estado de progreso
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
    currentFileName: '',
    statusMessage: 'Listo para procesar'
  });

  // Modal de Previsualización de Estudio
  const [previewModalItem, setPreviewModalItem] = useState(null);
  const [previewBgStyle, setPreviewBgStyle] = useState('studio'); // 'studio' | 'checkerboard' | 'white' | 'black' | 'custom'
  const [isZoomActual, setIsZoomActual] = useState(false);

  // Modal de Ajustes Individuales
  const [editingImage, setEditingImage] = useState(null);
  const [editLocalConfig, setEditLocalConfig] = useState({
    enableShadow: true,
    shadowBlur: 18,
    shadowOffsetY: 15,
    shadowOpacity: 0.45,
    contrast: 0,
    brightness: 0,
    paddingPercent: 5,
    quality: 85
  });

  // Manejo de fondo personalizado
  const handleBgFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (customBgPreviewUrl) URL.revokeObjectURL(customBgPreviewUrl);
      setCustomBgFile(file);
      setCustomBgPreviewUrl(URL.createObjectURL(file));
      setBgMode('custom');
    }
  };

  const handleClearCustomBg = () => {
    if (customBgPreviewUrl) URL.revokeObjectURL(customBgPreviewUrl);
    setCustomBgFile(null);
    setCustomBgPreviewUrl(null);
    setBgMode('transparent');
  };

  // Conexión SignalR
  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/processing`)
      .withAutomaticReconnect()
      .build();

    connection.on('Connected', (id) => {
      setConnectionId(id);
      setIsConnected(true);
    });

    connection.on('ReceiveProgress', (data) => {
      setProgress({
        current: data.current,
        total: data.total,
        succeeded: data.succeeded,
        failed: data.failed,
        currentFileName: data.currentFileName,
        statusMessage: data.statusMessage
      });
    });

    connection.on('ReceiveImageCompleted', (result) => {
      setCompletedImages((prev) => [
        {
          originalFileName: result.originalFileName,
          webpFileName: result.webpFileName,
          url: `${API_BASE_URL}${result.url}`,
          sizeBytes: result.sizeBytes,
          selected: true
        },
        ...prev
      ]);
    });

    connection.on('ReceiveImageError', (err) => {
      setErrors((prev) => [err, ...prev]);
    });

    connection.on('ReceiveBatchCompleted', (summary) => {
      setIsProcessing(false);
      setProgress((prev) => ({
        ...prev,
        statusMessage: summary.message || 'Lote completado con éxito.'
      }));
      setActiveTab('processed');
    });

    connection
      .start()
      .then(() => setIsConnected(true))
      .catch((err) => console.error('SignalR error:', err));

    return () => {
      connection.stop();
    };
  }, []);

  // Agregar imágenes
  const addImagesToList = useCallback((acceptedFiles) => {
    const newItems = acceptedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      selected: true,
      customConfig: null
    }));

    setOriginalImages((prev) => [...prev, ...newItems]);
  }, []);

  // Dropzone
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        addImagesToList(acceptedFiles);
      }
    },
    [addImagesToList]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    noClick: false,
    noKeyboard: false
  });

  // Operaciones de Selección en Originales
  const toggleSelectOriginal = (id) => {
    setOriginalImages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const selectAllOriginals = (select) => {
    setOriginalImages((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const invertSelectionOriginals = () => {
    setOriginalImages((prev) => prev.map((item) => ({ ...item, selected: !item.selected })));
  };

  const deleteSelectedOriginals = () => {
    setOriginalImages((prev) => {
      const remaining = prev.filter((item) => !item.selected);
      prev.filter((item) => item.selected).forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return remaining;
    });
  };

  const removeSingleOriginal = (id) => {
    setOriginalImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearAllOriginals = () => {
    originalImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setOriginalImages([]);
  };

  const selectedOriginals = useMemo(
    () => originalImages.filter((img) => img.selected),
    [originalImages]
  );
  const selectedOriginalsCount = selectedOriginals.length;
  const isAllOriginalsSelected =
    originalImages.length > 0 && selectedOriginalsCount === originalImages.length;

  // Operaciones de Selección en Tratadas
  const toggleSelectTreated = (webpFileName) => {
    setCompletedImages((prev) =>
      prev.map((item) =>
        item.webpFileName === webpFileName ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const selectAllTreated = (select) => {
    setCompletedImages((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const invertSelectionTreated = () => {
    setCompletedImages((prev) => prev.map((item) => ({ ...item, selected: !item.selected })));
  };

  const selectedTreated = useMemo(
    () => completedImages.filter((img) => img.selected),
    [completedImages]
  );
  const selectedTreatedCount = selectedTreated.length;
  const isAllTreatedSelected =
    completedImages.length > 0 && selectedTreatedCount === completedImages.length;

  // Descargar ZIP Masivo
  const handleDownloadZip = async (targetItems = null) => {
    const itemsToDownload = targetItems || (selectedTreatedCount > 0 ? selectedTreated : completedImages);
    if (itemsToDownload.length === 0 || isDownloadingZip) return;

    setIsDownloadingZip(true);
    try {
      const fileNames = itemsToDownload.map((item) => item.webpFileName);
      const response = await fetch(`${API_BASE_URL}/api/images/download-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileNames })
      });

      if (!response.ok) {
        throw new Error('No se pudo generar el archivo ZIP.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `PhotoDeep_WebP_Lote_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert(`Error al descargar ZIP: ${err.message}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Apertura del Editor de Efectos Individual
  const openEditorForImage = (imageItem) => {
    const existing = imageItem.customConfig;
    setEditLocalConfig({
      enableShadow: existing?.enableShadow ?? enableShadow,
      shadowBlur: existing?.shadowBlur ?? shadowBlur,
      shadowOffsetY: existing?.shadowOffsetY ?? shadowOffsetY,
      shadowOpacity: existing?.shadowOpacity ?? shadowOpacity,
      contrast: existing?.contrast ?? contrast,
      brightness: existing?.brightness ?? brightness,
      paddingPercent: existing?.paddingPercent ?? paddingPercent,
      quality: existing?.quality ?? quality
    });
    setEditingImage(imageItem);
  };

  const saveEffectsForSingleImage = () => {
    if (!editingImage) return;
    setOriginalImages((prev) =>
      prev.map((item) =>
        item.id === editingImage.id ? { ...item, customConfig: { ...editLocalConfig } } : item
      )
    );
    setEditingImage(null);
  };

  const applyEffectsToAllImages = () => {
    setEnableShadow(editLocalConfig.enableShadow);
    setShadowBlur(editLocalConfig.shadowBlur);
    setShadowOffsetY(editLocalConfig.shadowOffsetY);
    setShadowOpacity(editLocalConfig.shadowOpacity);
    setContrast(editLocalConfig.contrast);
    setBrightness(editLocalConfig.brightness);
    setPaddingPercent(editLocalConfig.paddingPercent);
    setQuality(editLocalConfig.quality);

    setOriginalImages((prev) =>
      prev.map((item) => ({ ...item, customConfig: { ...editLocalConfig } }))
    );
    setEditingImage(null);
  };

  // Ejecutar Procesamiento
  const executeProcessing = async (targetItems) => {
    if (targetItems.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setCompletedImages([]);
    setErrors([]);
    setProgress({
      current: 0,
      total: targetItems.length,
      succeeded: 0,
      failed: 0,
      currentFileName: targetItems[0].name,
      statusMessage: 'Iniciando pipeline rembg + SkiaSharp paso a paso...'
    });

    const formData = new FormData();
    targetItems.forEach((item) => {
      formData.append('files', item.file);
    });

    if (bgMode === 'custom' && customBgFile) {
      formData.append('customBackground', customBgFile);
    }

    const perImageMap = {};
    targetItems.forEach((item) => {
      if (item.customConfig) {
        perImageMap[item.file.name] = {
          enableShadow: item.customConfig.enableShadow,
          shadowBlur: item.customConfig.shadowBlur,
          shadowOffsetY: item.customConfig.shadowOffsetY,
          shadowOpacity: item.customConfig.shadowOpacity,
          contrast: 1.0 + item.customConfig.contrast / 100,
          brightness: item.customConfig.brightness,
          paddingPercent: item.customConfig.paddingPercent,
          quality: item.customConfig.quality
        };
      }
    });

    if (Object.keys(perImageMap).length > 0) {
      formData.append('perImageConfigsJson', JSON.stringify(perImageMap));
    }

    try {
      const query = new URLSearchParams({
        quality: quality.toString(),
        maxConcurrency: maxConcurrency.toString(),
        model: aiModel,
        enableShadow: enableShadow.toString(),
        shadowBlur: shadowBlur.toString(),
        shadowOffsetY: shadowOffsetY.toString(),
        shadowOpacity: shadowOpacity.toString(),
        contrast: (1.0 + contrast / 100).toFixed(2),
        brightness: brightness.toString(),
        paddingPercent: paddingPercent.toString(),
        ...(connectionId ? { connectionId } : {})
      });

      const response = await fetch(`${API_BASE_URL}/api/images/process-upload?${query}`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error en el servidor durante el procesamiento.');
      }
    } catch (error) {
      setIsProcessing(false);
      setErrors((prev) => [{ fileName: 'Sistema', errorMessage: error.message }, ...prev]);
    }
  };

  const handleStartProcessing = () => {
    executeProcessing(selectedOriginals);
  };

  const handleProcessSingleImmediately = (imageItem) => {
    setEditingImage(null);
    executeProcessing([imageItem]);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const progressPercentage =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white antialiased">
      {/* Overlay Drag & Drop */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 bg-indigo-950/85 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-indigo-400 p-8 text-center animate-in fade-in duration-150">
          <UploadCloud className="w-16 h-16 text-indigo-300 animate-bounce mb-3" />
          <h2 className="text-2xl font-bold text-white tracking-tight">Suelta tus imágenes aquí</h2>
          <p className="text-indigo-200 mt-1 text-xs">Se agregarán automáticamente a la lista de trabajo</p>
        </div>
      )}

      {/* 1. TOP NAVBAR PRINCIPAL (Limpio, con jerarquía tipográfica consistente) */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Marca / Título */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white">PhotoDeep</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300">
                  Bulk WebP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-normal">
                Eliminación de fondo por IA y optimización de imagen local
              </p>
            </div>
          </div>

          {/* Barra de Acciones Globales */}
          <div className="flex items-center gap-2">
            {/* Botón de Ajustes de Estudio */}
            <button
              type="button"
              onClick={() => setShowEffectsPanel(!showEffectsPanel)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                showEffectsPanel
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Efectos de Estudio</span>
              {enableShadow && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showEffectsPanel ? 'rotate-180' : ''}`} />
            </button>

            {/* Botón Principal: Procesar Lote */}
            <button
              type="button"
              onClick={handleStartProcessing}
              disabled={isProcessing || selectedOriginalsCount === 0}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer ${
                isProcessing || selectedOriginalsCount === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Procesando ({progress.current}/{progress.total})...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Procesar {selectedOriginalsCount} Seleccionada{selectedOriginalsCount === 1 ? '' : 's'}</span>
                </>
              )}
            </button>

            {/* Estado de Conexión SignalR */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>{isConnected ? 'SignalR' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* Barra de Progreso en Vivo */}
        {(isProcessing || progress.current > 0) && (
          <div className="max-w-7xl mx-auto pt-2 mt-2 border-t border-slate-800 space-y-1 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                {progress.statusMessage}
              </span>
              <span className="font-mono text-indigo-400 font-bold tabular-nums">
                {progress.current} / {progress.total} ({progressPercentage}%)
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* 2. PANEL DE CONTROL DE ESTUDIO (Desplegable organizado) */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
          {/* Fila de Controles Básicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* 1. Fondo del Producto */}
            <div className="flex items-center justify-between gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-medium">Fondo:</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBgMode('transparent')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                    bgMode === 'transparent'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Transparente
                </button>
                <label
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                    bgMode === 'custom'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {customBgFile ? customBgFile.name.slice(0, 8) + '...' : 'Subir Fondo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleBgFileChange}
                  />
                </label>
                {customBgFile && (
                  <button
                    type="button"
                    onClick={handleClearCustomBg}
                    className="text-rose-400 hover:text-rose-300 ml-1 cursor-pointer"
                    title="Quitar fondo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Modelo de IA (Velocidad vs Precisión) */}
            <div className="flex items-center justify-between gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-medium">Modelo:</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAiModel('u2netp')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                    aiModel === 'u2netp'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Modelo ligero u2netp: ~1.4s por foto. Ideal para e-commerce, productos, ropa y objetos."
                >
                  <span>⚡ Rápido (1.4s)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiModel('u2net')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                    aiModel === 'u2net'
                      ? 'bg-indigo-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Modelo profundo u2net: ~7s por foto. Para cabello hiperfino, personas o bordes muy complejos."
                >
                  <span>Preciso (7s)</span>
                </button>
              </div>
            </div>

            {/* 3. Concurrencia (Presets de Hilos) */}
            <div className="flex items-center justify-between gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-medium">Hilos:</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMaxConcurrency(1)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                    maxConcurrency === 1 ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Paso a paso: ideal para observar el progreso foto a foto"
                >
                  1x (Uno a uno)
                </button>
                <button
                  type="button"
                  onClick={() => setMaxConcurrency(2)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                    maxConcurrency === 2 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  2x
                </button>
                <button
                  type="button"
                  onClick={() => setMaxConcurrency(4)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                    maxConcurrency === 4 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  4x
                </button>
              </div>
            </div>

            {/* 3. Calidad WebP */}
            <div className="flex items-center justify-between gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Sliders className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-medium">WebP:</span>
              </div>
              <div className="flex items-center gap-2 flex-1 max-w-[140px]">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={quality}
                  disabled={isProcessing}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="flex-1 cursor-pointer h-1.5 accent-indigo-500"
                />
                <span className="font-mono text-indigo-400 font-bold w-8 text-right tabular-nums">
                  {quality}%
                </span>
              </div>
            </div>
          </div>

          {/* Panel Desplegable de Efectos de Estudio */}
          {showEffectsPanel && (
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in slide-in-from-top-2 duration-150 shadow-inner">
              {/* Sombra */}
              <div className="flex flex-col gap-1.5 p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                    Sombra Proyectada
                  </label>
                  <input
                    type="checkbox"
                    checked={enableShadow}
                    onChange={(e) => setEnableShadow(e.target.checked)}
                    className="accent-indigo-500 cursor-pointer"
                  />
                </div>
                {enableShadow && (
                  <div className="space-y-1 pt-1 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Blur: {shadowBlur}px</span>
                      <input
                        type="range"
                        min="5"
                        max="40"
                        value={shadowBlur}
                        onChange={(e) => setShadowBlur(Number(e.target.value))}
                        className="w-20 accent-indigo-500 h-1 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Opacidad: {Math.round(shadowOpacity * 100)}%</span>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={Math.round(shadowOpacity * 100)}
                        onChange={(e) => setShadowOpacity(Number(e.target.value) / 100)}
                        className="w-20 accent-indigo-500 h-1 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Contraste */}
              <div className="flex flex-col gap-1.5 p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Contrast className="w-3.5 h-3.5 text-indigo-400" />
                    Contraste
                  </label>
                  <span className="font-mono text-indigo-400 tabular-nums">
                    {contrast > 0 ? `+${contrast}` : contrast}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 cursor-pointer mt-1"
                />
              </div>

              {/* Brillo */}
              <div className="flex flex-col gap-1.5 p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-indigo-400" />
                    Brillo
                  </label>
                  <span className="font-mono text-indigo-400 tabular-nums">
                    {brightness > 0 ? `+${brightness}` : brightness}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 cursor-pointer mt-1"
                />
              </div>

              {/* Margen / Padding Interior */}
              <div className="flex flex-col gap-1.5 p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                    Margen Interior
                  </label>
                  <span className="font-mono text-indigo-400 tabular-nums">{paddingPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  value={paddingPercent}
                  onChange={(e) => setPaddingPercent(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 cursor-pointer mt-1"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. ÁREA DE TRABAJO (TABS Y GALERÍAS) */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 flex flex-col gap-4">
        {/* Barra de Navegación de Pestañas y Acciones en Lote */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          {/* Segmented Controls para Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('originals')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'originals'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Originales</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/30 font-mono text-[10px]">
                {originalImages.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('processed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'processed'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Tratadas</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/30 font-mono text-[10px]">
                {completedImages.length}
              </span>
              {completedImages.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>

          {/* Acciones Masivas para Pestaña "Originales" */}
          {activeTab === 'originals' && originalImages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 px-2 py-1 bg-slate-900 rounded-lg border border-slate-800 text-[11px]">
                <strong className="text-indigo-400 font-mono">{selectedOriginalsCount}</strong> de{' '}
                <span className="text-slate-200 font-mono">{originalImages.length}</span> seleccionadas
              </span>

              <button
                type="button"
                onClick={() => selectAllOriginals(!isAllOriginalsSelected)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-medium flex items-center gap-1.5 cursor-pointer"
              >
                {isAllOriginalsSelected ? (
                  <>
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>Deseleccionar</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Seleccionar Todas</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={invertSelectionOriginals}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-medium cursor-pointer"
              >
                Invertir
              </button>

              {selectedOriginalsCount > 0 && (
                <button
                  type="button"
                  onClick={deleteSelectedOriginals}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/60 text-rose-300 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Marcadas</span>
                </button>
              )}

              <button
                type="button"
                onClick={clearAllOriginals}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-900 text-slate-400 hover:text-rose-400 font-medium cursor-pointer"
              >
                Limpiar Todo
              </button>
            </div>
          )}

          {/* Acciones Masivas para Pestaña "Tratadas" (SELECCIONAR TODAS Y DESCARGAR ZIP) */}
          {activeTab === 'processed' && completedImages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Contador */}
              <span className="text-slate-400 px-2 py-1 bg-slate-900 rounded-lg border border-slate-800 text-[11px]">
                <strong className="text-emerald-400 font-mono">{selectedTreatedCount}</strong> de{' '}
                <span className="text-slate-200 font-mono">{completedImages.length}</span> seleccionadas
              </span>

              {/* Seleccionar Todas */}
              <button
                type="button"
                onClick={() => selectAllTreated(!isAllTreatedSelected)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-medium flex items-center gap-1.5 cursor-pointer"
              >
                {isAllTreatedSelected ? (
                  <>
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>Deseleccionar</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Seleccionar Todas</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={invertSelectionTreated}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-medium cursor-pointer"
              >
                Invertir
              </button>

              {/* Botón Descargar Todo en ZIP */}
              <button
                type="button"
                onClick={() => handleDownloadZip()}
                disabled={isDownloadingZip}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                {isDownloadingZip ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                <span>
                  Descargar {selectedTreatedCount > 0 ? selectedTreatedCount : completedImages.length} en ZIP
                </span>
              </button>

              {/* Alternador de fondo de tarjeta: Estudio vs Rejilla */}
              <button
                type="button"
                onClick={() => setTreatedCardBg(treatedCardBg === 'studio' ? 'grid' : 'studio')}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                title={treatedCardBg === 'studio' ? 'Ver con cuadrícula de transparencia' : 'Ver con fondo estudio oscuro'}
              >
                <Grid className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setCompletedImages([])}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-900 text-slate-400 hover:text-rose-400 font-medium flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>
            </div>
          )}
        </div>

        {/* CONTENIDO PESTAÑA 1: ORIGINALES */}
        {activeTab === 'originals' && (
          <div className="flex-1 flex flex-col gap-4">
            {originalImages.length === 0 ? (
              <div
                {...getRootProps()}
                className="flex-1 min-h-[50vh] rounded-2xl border-2 border-dashed border-slate-800 hover:border-indigo-500 bg-slate-900/40 hover:bg-slate-900/60 transition flex flex-col items-center justify-center p-8 text-center cursor-pointer group"
              >
                <input {...getInputProps()} />
                <div className="w-14 h-14 rounded-2xl bg-indigo-950 border border-indigo-800/80 flex items-center justify-center group-hover:scale-105 transition duration-150 shadow-md mb-3">
                  <UploadCloud className="w-7 h-7 text-indigo-400" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Arrastra tus fotos o pulsa para explorar</h3>
                <p className="text-slate-400 text-xs mt-1 max-w-sm">
                  Procesamiento masivo de imágenes JPG, PNG o WebP de forma 100% local.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {/* Botón rápido "Agregar más" */}
                <div
                  {...getRootProps()}
                  className="rounded-xl border-2 border-dashed border-slate-800 hover:border-indigo-500 bg-slate-900/30 hover:bg-slate-900/60 transition p-4 flex flex-col items-center justify-center text-center cursor-pointer min-h-[220px] group aspect-[4/5]"
                >
                  <input {...getInputProps()} />
                  <div className="w-9 h-9 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition mb-2">
                    <Plus className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-300">Agregar Más</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Arrastra o pulsa</span>
                </div>

                {/* Tarjetas de Originales */}
                {originalImages.map((item) => (
                  <div
                    key={item.id}
                    className={`gallery-card relative group rounded-xl border overflow-hidden bg-slate-900 flex flex-col transition shadow-sm aspect-[4/5] ${
                      item.selected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'border-slate-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {/* Checkbox de Selección */}
                    <button
                      type="button"
                      onClick={() => toggleSelectOriginal(item.id)}
                      className="absolute top-2 left-2 z-10 w-6 h-6 rounded-md flex items-center justify-center transition shadow-md cursor-pointer border bg-slate-950/80 backdrop-blur-sm border-slate-700 hover:border-indigo-400"
                    >
                      {item.selected ? (
                        <div className="w-full h-full bg-indigo-600 rounded flex items-center justify-center text-white">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded bg-transparent" />
                      )}
                    </button>

                    {/* Botón de Ajustes Individuales */}
                    <button
                      type="button"
                      onClick={() => openEditorForImage(item)}
                      className={`absolute top-2 right-9 z-10 p-1.5 rounded-md backdrop-blur-sm transition cursor-pointer border ${
                        item.customConfig
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                          : 'bg-slate-950/80 text-slate-400 hover:text-white border-slate-700'
                      }`}
                      title="Ajustar efectos (Sombra/Contraste/Padding) para esta imagen"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Botón Eliminar */}
                    <button
                      type="button"
                      onClick={() => removeSingleOriginal(item.id)}
                      className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-slate-950/80 backdrop-blur-sm text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-900 transition cursor-pointer"
                      title="Quitar de la cola"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    {/* Contenedor de la Imagen: Estudio Oscuro Limpio */}
                    <div
                      className="flex-1 bg-slate-950 flex items-center justify-center p-3 cursor-pointer overflow-hidden relative"
                      onClick={() =>
                        setPreviewModalItem({
                          url: item.previewUrl,
                          title: item.name,
                          sizeBytes: item.size,
                          isTreated: false
                        })
                      }
                    >
                      <img
                        src={item.previewUrl}
                        alt={item.name}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain transition duration-150 group-hover:scale-102"
                      />
                      {item.customConfig && (
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-indigo-950/90 border border-indigo-700 text-[9px] font-bold text-indigo-300">
                          Efectos activos
                        </div>
                      )}
                    </div>

                    {/* Pie de tarjeta con info */}
                    <div className="p-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] bg-slate-900">
                      <span className="truncate text-slate-300 font-medium" title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-slate-500 shrink-0 ml-1 font-mono text-[10px]">
                        {formatBytes(item.size)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO PESTAÑA 2: TRATADAS (SELECCIONABLES, SIN BORDES FEOS DE REJILLA) */}
        {activeTab === 'processed' && (
          <div className="flex-1 flex flex-col gap-4">
            {completedImages.length === 0 ? (
              <div className="flex-1 min-h-[50vh] rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mb-3">
                  <FileCheck className="w-7 h-7 text-slate-600" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Aún no hay imágenes tratadas</h3>
                <p className="text-slate-400 text-xs mt-1 max-w-sm">
                  Ve a "Originales", selecciona las imágenes y pulsa "Procesar Imágenes" para verlas aquí.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {completedImages.map((img, idx) => (
                  <div
                    key={`${img.webpFileName}-${idx}`}
                    className={`gallery-card relative group rounded-xl border overflow-hidden bg-slate-900 flex flex-col transition shadow-sm aspect-[4/5] ${
                      img.selected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-slate-800 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {/* Checkbox de Selección en Tratadas */}
                    <button
                      type="button"
                      onClick={() => toggleSelectTreated(img.webpFileName)}
                      className="absolute top-2 left-2 z-10 w-6 h-6 rounded-md flex items-center justify-center transition shadow-md cursor-pointer border bg-slate-950/80 backdrop-blur-sm border-slate-700 hover:border-emerald-400"
                    >
                      {img.selected ? (
                        <div className="w-full h-full bg-emerald-600 rounded flex items-center justify-center text-white">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded bg-transparent" />
                      )}
                    </button>

                    {/* Botón Descarga Individual */}
                    <a
                      href={img.url}
                      download={img.webpFileName}
                      className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-slate-950/80 backdrop-blur-sm text-slate-300 hover:text-white border border-slate-700 hover:border-emerald-500 transition cursor-pointer shadow-md"
                      title="Descargar este WebP"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>

                    {/* Contenedor de la Imagen: ESTUDIO LIMPIO (NO tablero desbordante) */}
                    <div
                      className={`flex-1 flex items-center justify-center p-3 cursor-pointer overflow-hidden relative ${
                        treatedCardBg === 'grid'
                          ? 'bg-[conic-gradient(#cbd5e1_90deg,#f8fafc_90deg_180deg,#cbd5e1_180deg_270deg,#f8fafc_270deg)] bg-[length:14px_14px]'
                          : 'bg-slate-950'
                      }`}
                      onClick={() =>
                        setPreviewModalItem({
                          url: img.url,
                          title: img.originalFileName,
                          sizeBytes: img.sizeBytes,
                          downloadUrl: img.url,
                          fileName: img.webpFileName,
                          isTreated: true
                        })
                      }
                    >
                      <img
                        src={img.url}
                        alt={img.originalFileName}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain transition duration-150 group-hover:scale-102"
                      />
                    </div>

                    {/* Pie de tarjeta con info y tamaño */}
                    <div className="p-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] bg-slate-900">
                      <div className="truncate flex-1 mr-1">
                        <p className="truncate text-slate-300 font-medium text-xs" title={img.originalFileName}>
                          {img.originalFileName}
                        </p>
                        <p className="text-[10px] text-emerald-400 font-mono font-bold mt-0.5">
                          WebP • {formatBytes(img.sizeBytes)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sección de Errores */}
        {errors.length > 0 && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs">
            <h4 className="font-bold text-rose-300 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Errores detectados ({errors.length})
            </h4>
            <ul className="space-y-1 max-h-28 overflow-y-auto text-rose-200 font-mono text-[11px]">
              {errors.map((e, i) => (
                <li key={i} className="truncate">
                  • <span className="font-bold">{e.fileName}:</span> {e.errorMessage}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {/* MODAL DE EDICIÓN DE EFECTOS */}
      {editingImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-3 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                  Efectos para: <span className="text-indigo-300 font-mono">{editingImage.name}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingImage(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Previsualización en Vivo */}
            <div className="relative w-full h-48 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden p-3">
              <img
                src={editingImage.previewUrl}
                alt={editingImage.name}
                className="max-h-full max-w-full object-contain transition-all duration-150"
                style={{
                  padding: `${editLocalConfig.paddingPercent}%`,
                  filter: `contrast(${1 + editLocalConfig.contrast / 100}) brightness(${
                    1 + editLocalConfig.brightness / 100
                  }) ${
                    editLocalConfig.enableShadow
                      ? `drop-shadow(0px ${editLocalConfig.shadowOffsetY}px ${
                          editLocalConfig.shadowBlur
                        }px rgba(0,0,0,${editLocalConfig.shadowOpacity}))`
                      : ''
                  }`
                }}
              />
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Sombra</span>
                  <input
                    type="checkbox"
                    checked={editLocalConfig.enableShadow}
                    onChange={(e) =>
                      setEditLocalConfig({ ...editLocalConfig, enableShadow: e.target.checked })
                    }
                    className="accent-indigo-500 cursor-pointer"
                  />
                </div>
                {editLocalConfig.enableShadow && (
                  <div className="space-y-1 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Blur: {editLocalConfig.shadowBlur}px</span>
                      <input
                        type="range"
                        min="5"
                        max="40"
                        value={editLocalConfig.shadowBlur}
                        onChange={(e) =>
                          setEditLocalConfig({
                            ...editLocalConfig,
                            shadowBlur: Number(e.target.value)
                          })
                        }
                        className="w-20 accent-indigo-500 h-1 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Opacidad: {Math.round(editLocalConfig.shadowOpacity * 100)}%</span>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={Math.round(editLocalConfig.shadowOpacity * 100)}
                        onChange={(e) =>
                          setEditLocalConfig({
                            ...editLocalConfig,
                            shadowOpacity: Number(e.target.value) / 100
                          })
                        }
                        className="w-20 accent-indigo-500 h-1 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Contraste</span>
                  <span className="font-mono text-indigo-400">{editLocalConfig.contrast}%</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={editLocalConfig.contrast}
                  onChange={(e) =>
                    setEditLocalConfig({ ...editLocalConfig, contrast: Number(e.target.value) })
                  }
                  className="w-full accent-indigo-500 h-1 cursor-pointer"
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold text-slate-200">Brillo</span>
                  <span className="font-mono text-indigo-400">{editLocalConfig.brightness}%</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={editLocalConfig.brightness}
                  onChange={(e) =>
                    setEditLocalConfig({ ...editLocalConfig, brightness: Number(e.target.value) })
                  }
                  className="w-full accent-indigo-500 h-1 cursor-pointer"
                />
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1 col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Margen Interior</span>
                  <span className="font-mono text-indigo-400">{editLocalConfig.paddingPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  value={editLocalConfig.paddingPercent}
                  onChange={(e) =>
                    setEditLocalConfig({
                      ...editLocalConfig,
                      paddingPercent: Number(e.target.value)
                    })
                  }
                  className="w-full accent-indigo-500 h-1 cursor-pointer"
                />
              </div>
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => handleProcessSingleImmediately(editingImage)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Procesar solo esta</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={applyEffectsToAllImages}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg shadow-sm transition cursor-pointer"
                >
                  Aplicar a TODAS
                </button>
                <button
                  type="button"
                  onClick={saveEffectsForSingleImage}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-sm transition cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PREVISUALIZACIÓN DE ESTUDIO (LIMPIO, SIN BORDES FEOS) */}
      {previewModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-4 shadow-2xl flex flex-col gap-3 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-xs font-bold text-white truncate max-w-md">
                  {previewModalItem.title}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {previewModalItem.isTreated ? 'WebP Tratado' : 'Original'} •{' '}
                  <span className="font-mono text-indigo-400 font-bold">
                    {formatBytes(previewModalItem.sizeBytes)}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsZoomActual(!isZoomActual)}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white transition cursor-pointer"
                  title={isZoomActual ? 'Ajustar al visor' : 'Tamaño real 100%'}
                >
                  {isZoomActual ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewModalItem(null);
                    setIsZoomActual(false);
                  }}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Alternador de fondo del lienzo */}
            {previewModalItem.isTreated && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 text-[11px]">Lienzo de previsualización:</span>
                <div className="flex gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewBgStyle('studio')}
                    className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                      previewBgStyle === 'studio'
                        ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    Estudio Oscuro
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewBgStyle('checkerboard')}
                    className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                      previewBgStyle === 'checkerboard'
                        ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    Rejilla Alfa
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewBgStyle('white')}
                    className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                      previewBgStyle === 'white'
                        ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    Blanco
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewBgStyle('black')}
                    className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                      previewBgStyle === 'black'
                        ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    Negro
                  </button>
                  {customBgPreviewUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewBgStyle('custom')}
                      className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                        previewBgStyle === 'custom'
                          ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      Fondo Subido
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Escenario de Estudio */}
            <div className="relative w-full h-[58vh] rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-center p-4 overflow-auto">
              <div
                className={`relative rounded-lg shadow-xl transition-all duration-150 flex items-center justify-center overflow-hidden ${
                  previewBgStyle === 'checkerboard'
                    ? 'bg-[conic-gradient(#cbd5e1_90deg,#f8fafc_90deg_180deg,#cbd5e1_180deg_270deg,#f8fafc_270deg)] bg-[length:14px_14px]'
                    : previewBgStyle === 'white'
                    ? 'bg-white'
                    : previewBgStyle === 'black'
                    ? 'bg-black'
                    : previewBgStyle === 'studio'
                    ? 'bg-slate-900 border border-slate-800'
                    : 'bg-cover bg-center'
                }`}
                style={
                  previewBgStyle === 'custom' && customBgPreviewUrl
                    ? { backgroundImage: `url(${customBgPreviewUrl})` }
                    : {}
                }
              >
                <img
                  src={previewModalItem.url}
                  alt={previewModalItem.title}
                  className={
                    isZoomActual
                      ? 'max-none'
                      : 'max-h-[52vh] max-w-full object-contain'
                  }
                />
              </div>
            </div>

            {/* Footer de Descarga */}
            {previewModalItem.downloadUrl && (
              <div className="flex justify-end pt-1">
                <a
                  href={previewModalItem.downloadUrl}
                  download={previewModalItem.fileName}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar WebP</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
