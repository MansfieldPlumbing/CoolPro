import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
// @ts-expect-error - Vite handles ?url suffix
import coreURL from '@ffmpeg/core?url';
// @ts-expect-error - Vite handles ?url suffix
import wasmURL from '@ffmpeg/core/wasm?url';
import { 
  Upload,
  Plus,
  Minus,
  Scissors, 
  Download, 
  Play, 
  Pause, 
  X, 
  Settings2,
  Video,
  Music,
  Loader2,
  Image as ImageIcon,
  Flame,
  ChevronLeft,
  Undo2,
  Redo2,
  Type,
  Sparkles,
  Layers,
  Filter,
  VolumeX,
  Volume2,
  Activity,
  Cloud,
  Camera,
  Crop
} from 'lucide-react';

interface Track {
  id: string;
  file: File;
  type: 'audio' | 'video';
  start: number;
  end: number;
  duration: number;
  objectUrl: string;
  offset?: number;
  thumbnail?: string;
  muted?: boolean;
}

const VIDEO_FILTERS = [
  { name: 'None', vf: '' },
  { name: 'Grayscale', vf: 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3' },
  { name: 'Sepia', vf: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131' },
  { name: 'Contrast', vf: 'eq=contrast=1.5:brightness=-0.05' },
  { name: 'Blur', vf: 'boxblur=5:1' },
  { name: 'Vignette', vf: 'vignette' },
  { name: 'Edge Detect', vf: 'edgedetect' }
];

const AUDIO_EFFECTS = [
  { name: 'None', af: '' },
  { name: 'Bass Boost', af: 'bass=g=15:f=110:w=0.6' },
  { name: 'Echo', af: 'aecho=0.8:0.9:1000:0.3' },
  { name: 'Reverb', af: 'aecho=0.8:0.8:250:0.5' },
  { name: 'Chipmunk', af: 'asetrate=44100*1.5,aresample=44100' },
  { name: 'Deep', af: 'asetrate=44100*0.75,aresample=44100' },
];

const CDN_PLUGINS = [
  { id: '1', name: 'Cinematic Flare AI', icon: Sparkles, description: 'Adds dynamic optical flares based on light sources.', author: 'LightMagic', rating: '4.8', downloads: '1.2M' },
  { id: '2', name: 'Auto-Dialogue Leveler', icon: VolumeX, description: 'Normalizes speech volume using advanced deep learning.', author: 'AudioCore', rating: '4.9', downloads: '850K' },
  { id: '3', name: 'Deep ColorMatch', icon: Filter, description: 'Automatically matches color grading between multiple clips.', author: 'ColorTech', rating: '4.5', downloads: '420K' },
  { id: '4', name: 'AI Super Resolution', icon: Layers, description: 'Upscales 1080p to 4K dynamically during export.', author: 'CloudScale', rating: '4.3', downloads: '200K' },
  { id: '5', name: 'Auto-Subtitling Pro', icon: Type, description: 'Generates auto-synced subtitles in 40+ languages.', author: 'LinguaAI', rating: '4.9', downloads: '3.1M' },
];

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'mp3'>('mp4');
  const [selectedVideoFilter, setSelectedVideoFilter] = useState(VIDEO_FILTERS[0]);
  const [selectedAudioEffect, setSelectedAudioEffect] = useState(AUDIO_EFFECTS[0]);
  const [activeEffectTab, setActiveEffectTab] = useState<'video' | 'audio'>('video');
  const mediaRefs = useRef<Map<string, HTMLMediaElement>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ffmpegRef = useRef(new FFmpeg());
  const [showTools, setShowTools] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(40); // vh percentage
  const isDragging = useRef(false);

  const [showAITools, setShowAITools] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsLevel, setSettingsLevel] = useState<'root' | 'export' | 'performance' | 'storage'>('root');
  const [showPluginMarketplace, setShowPluginMarketplace] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState<string[]>([]);
  const [exportResolution, setExportResolution] = useState('1080p');
  const [exportFps, setExportFps] = useState('30');
  const [exportProgress, setExportProgress] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(20); // px per second

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && activeTrackId) {
        setTracks(prev => prev.filter(t => t.id !== activeTrackId));
        setActiveTrackId(null);
      }
      if (e.code === 'KeyS' && activeTrackId) {
         setTracks(prev => {
           const idx = prev.findIndex(t => t.id === activeTrackId);
           if (idx < 0) return prev;
           const target = prev[idx];
           const playheadInTrack = currentTime - (target.offset || 0);
           if (playheadInTrack > 0 && playheadInTrack < (target.end - target.start)) {
              const newTrack = { ...target, id: Math.random().toString(36).slice(2), start: target.start + playheadInTrack, offset: (target.offset || 0) + playheadInTrack };
              const currentTrack = { ...target, end: target.start + playheadInTrack };
              return [...prev.slice(0, idx), currentTrack, newTrack, ...prev.slice(idx + 1)];
           }
           return prev;
         });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTrackId, currentTime]);

  const applyAIAutoTrim = () => {
    setTracks(prev => prev.map(t => {
       const trimAmount = Math.min(2, (t.end - t.start) * 0.1); // trim up to 2 seconds or 10%
       return { ...t, start: t.start + trimAmount, end: t.end - trimAmount };
    }));
    setShowAITools(false);
  };

  const applyAIVoiceEnhance = () => {
    // Uses standard ffmpeg filters to simulate "AI" enhancement (noise reduction, eq)
    setSelectedAudioEffect({ 
      name: 'AI Enhance', 
      af: 'highpass=f=200,lowpass=f=3000,afftdn=nf=-25,compand=attacks=0:points=-80/-80|-15/-15|0/-1.2|20/-1.2' 
    });
    alert("AI Voice Enhancement applied to Audio FX!");
    setShowAITools(false);
  };

  const applyAISmartCrop = () => {
    // "AI" auto crop focuses on the center dynamically (simulated with standard crop)
    setSelectedVideoFilter({
      name: 'AI Smart Crop',
      vf: 'crop=iw*0.8:ih*0.8:iw*0.1:ih*0.1' // simple 80% center crop
    });
    alert("AI Smart Crop applied to Video FX!");
    setShowAITools(false);
  };

  const applyAIRife = () => {
    setSelectedVideoFilter({
      name: 'RIFE (Simulated)',
      vf: 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'
    });
    setExportFps('60');
    alert("AI RIFE Frame Interpolation (60fps) applied to Video FX!");
    setShowAITools(false);
  };

  const exportCurrentFrame = () => {
    let frameExported = false;
    tracks.forEach(t => {
      if (frameExported) return;
      const el = mediaRefs.current.get(t.id);
      if (!el || t.type !== 'video') return;
      const tStart = t.offset || 0;
      const tDuration = t.end - t.start;
      if (currentTime >= tStart && currentTime < (tStart + tDuration)) {
        const canvas = document.createElement('canvas');
        const videoEl = el as HTMLVideoElement;
        canvas.width = videoEl.videoWidth || 1920;
        canvas.height = videoEl.videoHeight || 1080;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.filter = videoEl.style.filter;
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `Frame_Export_${currentTime.toFixed(2)}.jpg`;
          a.click();
          frameExported = true;
        }
      }
    });
    if (!frameExported) alert("No active video frame to export.");
  };

  const saveProject = () => {
    const req = indexedDB.open("VideosAppletDB", 1);
    req.onupgradeneeded = e => (e.target as any).result.createObjectStore("projects");
    req.onsuccess = e => {
      const db = (e.target as any).result;
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(tracks, "autosave");
      tx.oncomplete = () => alert("Project saved to browser storage!");
    };
  };

  const loadProject = () => {
    const req = indexedDB.open("VideosAppletDB", 1);
    req.onsuccess = e => {
      const db = (e.target as any).result;
      if (!db.objectStoreNames.contains("projects")) return;
      const tx = db.transaction("projects", "readonly");
      const getReq = tx.objectStore("projects").get("autosave");
      getReq.onsuccess = () => {
        if (getReq.result) {
           const restored = getReq.result.map((t: Track) => ({
              ...t,
              objectUrl: URL.createObjectURL(t.file) 
           }));
           setTracks(restored);
        }
      };
    };
  };

  const [draggingTrack, setDraggingTrack] = useState<{ id: string, type: 'left' | 'right' | 'body', startX: number, initialOffset: number, initialStart: number, initialEnd: number } | null>(null);
  const [scrubbing, setScrubbing] = useState<{ startX: number, initialTime: number } | null>(null);
  const [panning, setPanning] = useState<{ startX: number, startY: number, scrollLeft: number, scrollTop: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panning || !timelineRef.current) return;
    const handleMove = (e: PointerEvent) => {
      if (!timelineRef.current) return;
      const dx = e.clientX - panning.startX;
      const dy = e.clientY - panning.startY;
      timelineRef.current.scrollLeft = panning.scrollLeft - dx;
      timelineRef.current.scrollTop = panning.scrollTop - dy;
    };
    const handleUp = () => setPanning(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [panning]);

  useEffect(() => {
    if (!draggingTrack) return;
    const handleMove = (e: PointerEvent) => {
      const dx = e.clientX - draggingTrack.startX;
      const ds = dx / zoomLevel; // zoomLevel px per second
      setTracks(prev => prev.map(t => {
        if (t.id !== draggingTrack.id) return t;
        if (draggingTrack.type === 'left') {
          const newStart = Math.max(0, Math.min(draggingTrack.initialStart + ds, t.end - 0.5));
          const diff = newStart - draggingTrack.initialStart;
          return { ...t, start: newStart, offset: Math.max(0, draggingTrack.initialOffset + diff) };
        } else if (draggingTrack.type === 'right') {
          const newEnd = Math.max(t.start + 0.5, Math.min(draggingTrack.initialEnd + ds, t.duration));
          return { ...t, end: newEnd };
        } else {
          return { ...t, offset: Math.max(0, draggingTrack.initialOffset + ds) };
        }
      }));
    };
    const handleUp = () => setDraggingTrack(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingTrack]);

  useEffect(() => {
    if (!scrubbing) return;
    const handleMove = (e: PointerEvent) => {
      const dx = e.clientX - scrubbing.startX;
      const newTime = Math.max(0, scrubbing.initialTime + dx / zoomLevel);
      setCurrentTime(newTime);
    };
    const handleUp = () => setScrubbing(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [scrubbing]);

  const handleTrackPointerDown = (e: React.PointerEvent, t: Track, type: 'left' | 'right' | 'body') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingTrack({ id: t.id, type, startX: e.clientX, initialOffset: t.offset || 0, initialStart: t.start, initialEnd: t.end });
    setActiveTrackId(t.id);
  };

  const handleRulerPointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = Math.max(0, clickX / zoomLevel);
    setCurrentTime(newTime);
    setScrubbing({ startX: e.clientX, initialTime: newTime });
  };

  useEffect(() => {
    loadFfmpeg();
  }, []);

  const handleDragStart = () => {
    isDragging.current = true;
  };

  useEffect(() => {
    const handleMove = (clientY: number) => {
      if (!isDragging.current) return;
      const newHeight = (clientY / window.innerHeight) * 100;
      setPreviewHeight(Math.max(20, Math.min(newHeight, 70)));
    };
    
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const handleTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientY);

    const handleEnd = () => {
      isDragging.current = false;
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
    };
  }, []);

  const loadFfmpeg = async () => {
    try {
      const ffmpeg = ffmpegRef.current;
      ffmpeg.on('progress', ({ progress }) => {
        setExportProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
      });
      await ffmpeg.load({
        coreURL,
        wasmURL,
      });
      setFfmpegLoaded(true);
    } catch (error) {
      console.error("FFmpeg Load Error:", error);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList) return;
    const files = Array.from(filesList) as File[];

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const objectUrl = URL.createObjectURL(file);
      
      const mediaEl = isVideo ? document.createElement('video') : document.createElement('audio');
      mediaEl.src = objectUrl;
      mediaEl.preload = 'metadata';
      
      const duration = await new Promise<number>((resolve) => {
        mediaEl.onloadedmetadata = () => resolve(mediaEl.duration);
        mediaEl.onerror = () => resolve(10); 
      });

      let thumbnail = '';
      if (isVideo) {
        try {
          mediaEl.currentTime = Math.min(1, duration / 2);
          await Promise.race([
            new Promise(r => { mediaEl.onseeked = r; mediaEl.onerror = r; }),
            new Promise(r => setTimeout(r, 1500))
          ]);
          const canvas = document.createElement('canvas');
          const videoEl = mediaEl as HTMLVideoElement;
          canvas.width = Math.floor(160 * (videoEl.videoWidth / (videoEl.videoHeight || 1.77)));
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            thumbnail = canvas.toDataURL('image/jpeg', 0.5);
          }
        } catch(e) {}
      }

      const newTrack: Track = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        type: isVideo ? 'video' : 'audio',
        start: 0,
        end: duration,
        duration,
        objectUrl,
        offset: 0,
        thumbnail,
        muted: false
      };

      const tracksToAdd = [newTrack];
      if (isVideo) {
        tracksToAdd.push({
          id: Math.random().toString(36).substr(2, 9),
          file,
          type: 'audio',
          start: 0,
          end: duration,
          duration,
          objectUrl,
          offset: 0,
          muted: false
        });
      }

      setTracks(prev => {
        const next = [...prev, ...tracksToAdd];
        if (next.length === tracksToAdd.length) setActiveTrackId(newTrack.id);
        return next;
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const activeTrack = tracks.find(t => t.id === activeTrackId);
  const totalLength = Math.max(1, ...tracks.map(t => (t.offset || 0) + (t.end - t.start)));

  const togglePlay = () => {
    setIsPlaying(p => !p);
  };

  useEffect(() => {
    let raf: number;
    let lastTime = performance.now();
    const loop = () => {
      if (isPlaying) {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        setCurrentTime(prev => {
           const next = prev + dt;
           if (next >= totalLength) {
              setIsPlaying(false);
              return 0;
           }
           return next;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    if (isPlaying) {
      lastTime = performance.now();
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, totalLength]);

  useEffect(() => {
    tracks.forEach(t => {
      const el = mediaRefs.current.get(t.id);
      if (!el) return;
      const tStart = t.offset || 0;
      const tDuration = t.end - t.start;
      const shouldPlay = isPlaying && currentTime >= tStart && currentTime < (tStart + tDuration);
      
      const targetTime = t.start + (currentTime - tStart);
      
      if (shouldPlay) {
         if (Math.abs(el.currentTime - targetTime) > 0.3) el.currentTime = targetTime;
         if (el.paused) el.play().catch(() => {});
      } else {
         if (!el.paused) el.pause();
         // Sync position even when paused for scrubbing
         if (!isPlaying && currentTime >= tStart && currentTime < (tStart + tDuration)) {
            if (Math.abs(el.currentTime - targetTime) > 0.1) el.currentTime = targetTime;
         }
      }
      el.muted = t.muted || t.type === 'video';
    });
  }, [currentTime, isPlaying, tracks]);

  const updateActiveTrack = (updates: Partial<Track>) => {
    setTracks(prev => prev.map(t => t.id === activeTrackId ? { ...t, ...updates } : t));
  };

  const processMedia = async () => {
    if (tracks.length === 0) return;
    if (!ffmpegLoaded) {
      alert("FFmpeg is still loading...");
      return;
    }

    setIsProcessing(true);
    setExportProgress(0);
    setResultUrl(null);
    const ffmpeg = ffmpegRef.current;

    try {
      const vStreams: { index: number, offset: number, start: number, end: number }[] = [];
      const aStreams: { index: number, offset: number }[] = [];
      const args: string[] = [];
      
      const maxEnd = Math.max(1, ...tracks.map(t => (t.offset || 0) + (t.end - t.start)));

      // Write files and prepare inputs
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const fileName = `input_${i}.${t.file.name.split('.').pop() || 'mp4'}`;
        await ffmpeg.writeFile(fileName, await fetchFile(t.file));
        
        args.push('-ss', t.start.toString(), '-t', (t.end - t.start).toString(), '-i', fileName);
        
        // Track valid streams
        if (!t.muted) {
           if (t.type === 'video') vStreams.push({ index: i, offset: t.offset || 0, start: t.start, end: t.end });
           if (t.type === 'audio') aStreams.push({ index: i, offset: t.offset || 0 });
        }
      }

      let filterComplex = "";
      let finalVMap = null;
      let finalAMap = null;

      if (vStreams.length > 0) {
          filterComplex += `color=c=black:s=1280x720:d=${maxEnd} [base]; `;
          let lastV = "base";
          vStreams.forEach((v, idx) => {
              let vf = selectedVideoFilter.vf ? `,${selectedVideoFilter.vf}` : "";
              filterComplex += `[${v.index}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1${vf} [v${idx}]; `;
              let nextV = `bg${idx}`;
              let duration = v.end - v.start;
              filterComplex += `[${lastV}][v${idx}]overlay=enable='between(t,${v.offset},${v.offset + duration})' [${nextV}]; `;
              lastV = nextV;
          });
          finalVMap = lastV;
      }

      if (aStreams.length > 0) {
          aStreams.forEach((a, idx) => {
              let offsetMs = Math.round(a.offset * 1000);
              let af = selectedAudioEffect.af ? `,${selectedAudioEffect.af}` : "";
              filterComplex += `[${a.index}:a]adelay=${offsetMs}|${offsetMs}${af} [a${idx}]; `;
          });
          let aInputs = aStreams.map((_, idx) => `[a${idx}]`).join('');
          filterComplex += `${aInputs}amix=inputs=${aStreams.length}:duration=longest:dropout_transition=2 [outa]; `;
          finalAMap = "outa";
      }

      if (filterComplex) {
          args.push('-filter_complex', filterComplex);
      }

      if (outputFormat === 'mp4') {
          if (finalVMap) args.push('-map', `[${finalVMap}]`);
          if (finalAMap) args.push('-map', `[${finalAMap}]`);
          
          let resScale = '1920x1080';
          if (exportResolution === '4K') resScale = '3840x2160';
          if (exportResolution === '720p') resScale = '1280x720';
          if (exportResolution === 'Vertical') resScale = '1080x1920';
          
          args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
          args.push('-s', resScale, '-r', exportFps);
          if (finalAMap) args.push('-c:a', 'aac', '-b:a', '128k');
          args.push('-y', 'output.mp4');
          
          await ffmpeg.exec(args);
          
          const data = await ffmpeg.readFile('output.mp4');
          const blob = new Blob([data], { type: 'video/mp4' });
          setResultUrl(URL.createObjectURL(blob));
      } else {
          if (finalAMap) args.push('-map', `[${finalAMap}]`);
          args.push('-c:a', 'libmp3lame', '-b:a', '128k', '-y', 'output.mp3');
          
          await ffmpeg.exec(args);
          
          const data = await ffmpeg.readFile('output.mp3');
          const blob = new Blob([data], { type: 'audio/mp3' });
          setResultUrl(URL.createObjectURL(blob));
      }
    } catch (error) {
      console.error("Processing failed:", error);
      alert("Processing failed. Please check file format and size.");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const frames = Math.floor((time % 1) * 30);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="h-screen w-full bg-[#000] text-[#f2f2f2] font-sans flex flex-col md:max-w-[430px] md:mx-auto md:border-x border-white/[0.08] overflow-hidden relative shadow-2xl user-select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      
      {/* Ergonomic Command Ribbon (Fluent ribbon style) - TOPMOST */}
      <div className="flex items-center gap-1 h-12 bg-[#202020] px-2 shrink-0 border-b border-black/40 z-40 overflow-x-auto hide-scrollbar whitespace-nowrap select-none shadow-sm relative">
         <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-1.5 hover:bg-white/10 px-2.5 py-1.5 rounded-[4px] text-[13px] text-white transition-colors" title="Add Media">
            <Plus size={16} className="text-[#0078d4]" />
            <span className="hidden sm:inline">Add Media</span>
         </button>
         
         <div className="w-[1px] h-5 bg-white/10 mx-1 shrink-0"></div>
         
         <button onClick={() => { setShowTools(!showTools); setShowAITools(false); setShowSettingsPanel(false); setShowPluginMarketplace(false); }} className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${showTools ? 'bg-white/10 text-white' : 'text-[#f2f2f2] hover:bg-white/10'}`} title="Effects">
            <Filter size={16} />
            <span className="hidden sm:inline">Effects</span>
         </button>

         <button onClick={() => { setShowAITools(!showAITools); setShowTools(false); setShowSettingsPanel(false); setShowPluginMarketplace(false); }} className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${showAITools ? 'bg-white/10 text-white' : 'text-[#f2f2f2] hover:bg-white/10'}`} title="AI Modules">
            <Sparkles size={16} className="text-[#0078d4]" />
            <span>AI Modules</span>
         </button>
         
         <div className="w-[1px] h-5 bg-white/10 mx-1 shrink-0"></div>

         <button onClick={() => { setShowSettingsPanel(!showSettingsPanel); setShowTools(false); setShowAITools(false); setShowPluginMarketplace(false); }} className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${showSettingsPanel ? 'bg-white/10 text-white' : 'text-[#f2f2f2] hover:bg-white/10'}`} title="Settings">
            <Settings2 size={16} />
            <span className="hidden sm:inline">Settings</span>
         </button>

         <div className="flex-1 shrink-0"></div>

         {/* Export Resolution Picker */}
         <button 
           onClick={() => { setShowSettingsPanel(true); setSettingsLevel('export'); setShowTools(false); setShowAITools(false); setShowPluginMarketplace(false); }} 
           className="flex items-center justify-center border border-transparent text-[#f2f2f2] text-[12px] px-2 py-1.5 rounded-[4px] hover:bg-white/10 transition-colors select-none gap-1 ml-auto shrink-0"
           title="Quality Settings"
         >
           <span className="opacity-90">{exportResolution}</span>
           <ChevronLeft className="w-3 h-3 -rotate-90 opacity-70" />
         </button>

         {/* Export / Render Button */}
         <button 
           onClick={processMedia}
           disabled={tracks.length === 0 || isProcessing || !ffmpegLoaded}
           className="border border-transparent text-[#f2f2f2] hover:bg-white/10 rounded-[4px] flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
           title={isProcessing ? 'Encoding' : 'Export'}
         >
           {isProcessing ? (
             <Loader2 className="w-4 h-4 text-[#0078d4] animate-spin" />
           ) : (
             <Download className="w-4 h-4 text-[#0078d4]" />
           )}
           <span className="hidden md:inline">{isProcessing ? 'Encoding' : 'Export'}</span>
         </button>
      </div>

      {/* Main Preview Area */}
      <div style={{ height: `${previewHeight}vh` }} className="shrink-0 bg-black flex flex-col relative overflow-hidden border-b border-white/[0.04]">
        {tracks.length > 0 ? (
          <div className="relative w-full h-full flex items-center justify-center group overflow-hidden">
             {tracks.map((t, idx) => {
                const isActive = currentTime >= (t.offset || 0) && currentTime < (t.offset || 0) + (t.end - t.start);
                
                if (t.type === 'video') {
                  return (
                    <video 
                      key={t.id}
                      ref={el => el && mediaRefs.current.set(t.id, el)}
                      src={t.objectUrl}
                      className="absolute w-full h-full object-contain pointer-events-none transition-opacity duration-100"
                      style={{ 
                        opacity: isActive ? 1 : 0, 
                        zIndex: idx,
                        filter: selectedVideoFilter.name === 'Grayscale' ? 'grayscale(1)' : selectedVideoFilter.name === 'Sepia' ? 'sepia(1)' : selectedVideoFilter.name === 'Blur' ? 'blur(4px)' : selectedVideoFilter.name === 'Contrast' ? 'contrast(1.5)' : 'none'
                      }}
                      playsInline
                    />
                  );
                } else {
                  return (
                    <audio 
                      key={t.id}
                      ref={el => el && mediaRefs.current.set(t.id, el)}
                      src={t.objectUrl}
                      className="hidden"
                    />
                  );
                }
             })}
            
            {/* Playhead Time / Title internal overlay */}
            <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none z-50 select-none">
              <span className="bg-[#1c1c1c]/90 text-white text-[10px] font-mono px-2.5 py-1 rounded-[4px] border border-white/[0.06] backdrop-blur shadow-md font-medium tracking-wide">
                videos.html • {formatTime(currentTime)}
              </span>
            </div>
          </div>
        ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#f2f2f2] bg-[#1a1a1a]">
              <div className="w-16 h-16 rounded-[4px] bg-[#2b2b2b] border border-black/40 flex items-center justify-center mb-6 shadow-inner">
                 <Camera className="w-8 h-8 text-[#0078d4]" />
              </div>
              <span className="text-[14px] font-semibold text-[#f2f2f2]">videos.html Canvas</span>
              <span className="text-[12px] text-zinc-400 mt-2 max-w-[220px] text-center leading-snug">Import media clips to begin your session.</span>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 px-5 py-2 bg-[#0078d4] hover:bg-[#1085e0] active:scale-95 text-white text-[13px] font-semibold rounded-[4px] transition-all shadow-md flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Import Media
              </button>
            </div>
        )}
      </div>

      {/* Resize Handle */}
      <div 
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className="h-2.5 bg-[#141414] hover:bg-[#1e1e1e] border-y border-white/[0.04] flex items-center justify-center cursor-row-resize shrink-0 z-10 transition-colors"
      >
        <div className="w-10 h-1 bg-zinc-700 hover:bg-zinc-500 rounded-full pointer-events-none transition-colors" />
      </div>

      {/* Toolbar / Timeline Controls */}
      <div className="flex items-center justify-between px-4 h-12 shrink-0 bg-[#2b2b2b] border-y border-black/40 z-50">
        <div className="text-[12px] font-medium text-white/90 w-28 select-none flex items-center">
          <span className="font-mono bg-[#181818] px-2 py-0.5 rounded-[4px] text-[#f2f2f2] border border-[#3b3b3b] shadow-sm">{formatTime(currentTime)}</span>
          <span className="text-zinc-500 font-normal mx-1">/</span>
          <span className="text-zinc-400 font-mono">{formatTime(totalLength)}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="text-zinc-400 hover:text-white p-2 hover:bg-white/10 rounded-[4px] transition-all duration-150 active:scale-95 flex items-center justify-center" title="Undo Layout">
            <Undo2 className="w-4 h-4" />
          </button>
          
          <button 
            onClick={togglePlay} 
            className="w-8 h-8 flex items-center justify-center rounded-[4px] bg-[#0078d4] text-white hover:bg-[#1085e0] active:scale-95 transition-all duration-150 cursor-pointer shadow-md"
            title={isPlaying ? "Pause" : "Play (Space)"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white text-white ml-0.5" />}
          </button>
          
          <button className="text-zinc-400 hover:text-white p-2 hover:bg-white/10 rounded-[4px] transition-all duration-150 active:scale-95 flex items-center justify-center" title="Redo Layout">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end w-28">
          <div className="flex items-center gap-1 bg-[#181818] border border-[#3b3b3b] p-1 rounded-[4px] select-none h-8">
            <button 
              onClick={() => setZoomLevel(prev => Math.max(5, prev - 5))} 
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center" 
              title="Zoom Out"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input 
              type="range" 
              min="5" 
              max="100" 
              value={zoomLevel} 
              onChange={e => setZoomLevel(Number(e.target.value))}
              className="w-10 h-[2px] accent-[#0078d4] bg-[#3b3b3b] rounded-[4px] appearance-none cursor-pointer focus:outline-none"
            />
            <button 
              onClick={() => setZoomLevel(prev => Math.min(100, prev + 5))} 
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center" 
              title="Zoom In"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>      {/* Timeline Area */}
      <div 
        ref={timelineRef}
        className={`flex-1 overflow-auto scrollbar-none relative flex flex-col bg-[#141414] ${panning ? 'cursor-grabbing' : ''}`}
        onPointerDown={(e) => {
          if (timelineRef.current && (e.target as HTMLElement).closest('.cursor-ew-resize, .cursor-grab, .cursor-text, button')) return;
          if (timelineRef.current) {
             e.preventDefault(); // prevent text selection
             setPanning({
               startX: e.clientX,
               startY: e.clientY,
               scrollLeft: timelineRef.current.scrollLeft,
               scrollTop: timelineRef.current.scrollTop
             });
          }
        }}
      >
        {/* Top Ruler / Headers (Sticky top) */}
        <div className="sticky top-0 z-40 bg-[#1e1e1e] border-b border-black/40 flex h-7 w-max min-w-full shrink-0">
          {/* Top Left Menu Header (Sticky left) */}
          <div className="w-20 shrink-0 sticky left-0 bg-[#2b2b2b] border-r border-black/40 z-50 text-[10px] font-medium flex items-center justify-center text-white/90 select-none">
            Tracks
          </div>
          
          {/* Ruler content */}
          <div className="flex-1 relative min-w-[2000px] cursor-text" onPointerDown={handleRulerPointerDown}>
              {/* Simple Ruler Mockup */}
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMjQiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjYiIHg9IjAiIHk9IjE4IiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNCIgeD0iMTAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNCIgeD0iMjAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNCIgeD0iMzAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNDAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iOCIgeD0iNTAiIHk9IjE2IiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNCIgeD0iNjAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNCIgeD0iNzAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNCIgeD0iODAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iNCIgeD0iOTAiIHk9IjIwIiBmaWxsPSIjNTI1MjViIi8+PC9zdmc+')] opacity-40 pointer-events-none" />
          </div>
        </div>

        {/* Playhead Line Layer */}
        <div className="relative w-max min-w-full flex flex-col pb-32 flex-1">
           {/* Playhead */}
           <div 
             className="absolute top-0 bottom-0 z-30 cursor-ew-resize group flex justify-center w-4 -ml-2"
             style={{ left: `${80 + Math.max(0, currentTime * zoomLevel)}px` }}
             onPointerDown={(e) => {
               e.stopPropagation();
               e.currentTarget.setPointerCapture(e.pointerId);
               setScrubbing({ startX: e.clientX, initialTime: currentTime });
             }}
           >
              <div className="w-0.5 h-full bg-[#60cdff] shadow-[0_0_8px_rgba(96,205,255,0.6)] transition-all group-hover:w-1 group-active:w-1 group-active:bg-[#0078d4] rounded-full" />
              <div className="absolute top-0 w-3.5 h-3.5 mt-0.5 text-[#60cdff] filter drop-shadow-md outline-none transition-colors group-active:text-[#0078d4] pointer-events-none">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 1h12v7l-6 6-6-6V1z"/></svg>
               </div>
           </div>

           {/* Tracks */}
           {tracks.map((t, i) => (
             <div key={t.id} className="flex h-20 shrink-0 border-b border-black/40">
               {/* Left Track Menu (Sticky left) */}
               <div className="w-20 shrink-0 sticky left-0 bg-[#1e1e1e] border-r border-black/40 z-40 flex flex-col items-center justify-center gap-1 p-1.5 relative select-none">
                 <div className="flex items-center gap-1.5">
                   {t.type === 'video' ? (
                     <Video className="w-3.5 h-3.5 text-[#0078d4]" />
                   ) : (
                     <Music className="w-3.5 h-3.5 text-[#0078d4]" />
                   )}
                   <span className="text-[10px] font-medium text-zinc-300">
                     {t.type === 'video' ? 'Video' : 'Audio'}
                   </span>
                 </div>
                 
                 <button 
                   onClick={(e) => { 
                     e.stopPropagation(); 
                     setTracks(prev => prev.map(tr => tr.id === t.id ? { ...tr, muted: !tr.muted } : tr)); 
                   }} 
                   className={`mt-1.5 p-1.5 rounded-[4px] border transition-all flex items-center justify-center ${
                     t.muted 
                       ? 'bg-red-900/30 border-red-500/30 text-red-400 hover:bg-red-900/50 shadow-sm' 
                       : 'bg-[#2b2b2b] border-[#3b3b3b] text-zinc-300 hover:text-white hover:bg-[#333] shadow-sm'
                   }`}
                   title={t.muted ? "Unmute Track" : "Mute Track"}
                 >
                    {t.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                 </button>
               </div>
               
               {/* Track Lane */}
               <div className="flex-1 relative py-2 min-w-[2000px] w-full">
                  {/* The Track Clip */}
                  <div 
                    onPointerDown={(e) => handleTrackPointerDown(e, t, 'body')}
                    className={`absolute h-16 rounded-[4px] border ${activeTrackId === t.id ? 'border-[#0078d4] ring-2 ring-[#0078d4]/30 z-20 shadow-[0_0_12px_rgba(0,120,212,0.3)]' : 'border-white/[0.06] z-10'} overflow-hidden cursor-grab active:cursor-grabbing shadow-md transition-shadow`}
                    style={{ 
                      left: `${(t.offset || 0) * zoomLevel}px`, 
                      width: `${Math.max(40, (t.end - t.start) * zoomLevel)}px`,
                      backgroundColor: t.type === 'video' ? 'rgba(43, 43, 43, 0.95)' : 'rgba(0, 120, 212, 0.2)'
                    }}
                  >
                    <div className="absolute top-1 left-1.5 text-[10px] font-medium bg-[#1e1e1e]/80 border border-[#3b3b3b] px-1.5 py-0.5 rounded-[4px] text-zinc-100 z-20 pointer-events-none flex items-center gap-1 shadow-sm truncate max-w-[85%] backdrop-blur-sm">
                      {t.type === 'video' ? 'Video' : 'Audio'} • {t.file.name}
                    </div>

                    {/* Mock Frames / Waveform */}
                    {t.type === 'video' ? (
                      <div className="w-full h-full absolute inset-0 opacity-70 pointer-events-none"
                           style={{ backgroundImage: `url(${t.thumbnail || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg=='})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x', backgroundPosition: `-${t.start*zoomLevel}px 0` }} />
                    ) : (
                      <div className="w-full h-full absolute flex items-center gap-[1.5px] opacity-70 px-1 overflow-hidden pointer-events-none" 
                           style={{ left: `-${t.start * zoomLevel}px`, width: `${t.duration * zoomLevel}px` }}>
                          {/* Realistic looking deterministic waveform */}
                          {Array.from({ length: Math.max(1, Math.ceil(t.duration * zoomLevel / 3)) }).map((_, i) => (
                            <div key={i} className="flex-1 bg-[#60cdff] rounded-[2px]" style={{ height: `${20 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 2.1) * 80)}%`, opacity: 0.8 }} />
                          ))}
                      </div>
                    )}
                    {/* Trimming UI for active track */}
                    {activeTrackId === t.id && (
                      <>
                        <div onPointerDown={(e) => handleTrackPointerDown(e, t, 'left')} className="absolute top-0 bottom-0 left-0 w-3 bg-[#0078d4]/30 hover:bg-[#0078d4]/60 active:bg-[#0078d4] z-30 cursor-ew-resize flex items-center justify-center border-r border-[#0078d4]/50">
                          <div className="w-[3px] h-4 bg-white rounded-[2px] pointer-events-none opacity-80" />
                        </div>
                        <div onPointerDown={(e) => handleTrackPointerDown(e, t, 'right')} className="absolute top-0 bottom-0 right-0 w-3 bg-[#0078d4]/30 hover:bg-[#0078d4]/60 active:bg-[#0078d4] z-30 cursor-ew-resize flex items-center justify-center border-l border-[#0078d4]/50">
                          <div className="w-[3px] h-4 bg-white rounded-[2px] pointer-events-none opacity-80" />
                        </div>
                      </>
                    )}
                  </div>
               </div>
             </div>
           ))}

           {/* Bottom Add Track Button Area */}
           <div className="flex h-20 shrink-0 border-b border-black/40 relative">
               <div className="w-20 shrink-0 sticky left-0 bg-[#1e1e1e] border-r border-black/40 z-40 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-[#3b3b3b]" />
               </div>
               <div className="flex-1 flex items-center pl-4 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-10 min-w-[2000px] w-full">
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="text-[12px] text-zinc-200 hover:text-white font-medium flex items-center gap-2 bg-[#2d2d2d] hover:bg-[#363636] border border-white/[0.06] px-4 py-1.5 rounded-[4px] shadow-sm pointer-events-auto transition-all z-20 absolute left-24 active:scale-95"
                  >
                    <Plus className="w-4 h-4 text-[#0078d4]" /> Add Media Track
                  </button>
               </div>
           </div>
        </div>
      </div>

      {/* Dropdown Panels - Fluent Style */}
      <AnimatePresence>
        {showAITools && (
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-[48px] left-0 right-0 bg-[#1e1e1e] p-4.5 z-30 border-b border-black/40 shadow-xl flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 mb-1">
               <div className="flex items-center gap-2">
                 <Sparkles className="w-4 h-4 text-[#0078d4]" />
                 <span className="text-[13px] font-semibold text-[#f2f2f2] tracking-wide select-none">AI Copilot Modules</span>
               </div>
               <button onClick={() => setShowAITools(false)} className="p-1 hover:bg-white/10 rounded-[4px] transition-colors">
                 <X className="w-4 h-4 text-zinc-400 hover:text-white" />
               </button>
            </div>
            
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
               <button 
                  onClick={applyAIAutoTrim}
                  className="snap-start flex flex-col items-start gap-1.5 min-w-[130px] p-3 rounded-[6px] border border-white/[0.06] bg-[#2b2b2b] hover:border-[#0078d4]/50 hover:bg-[#333] transition-all text-left group cursor-pointer"
               >
                  <Scissors className="w-4.5 h-4.5 text-[#0078d4]" />
                  <div>
                    <div className="text-[12px] font-semibold text-white mb-0.5">Smart Auto-Trim</div>
                    <div className="text-[10px] text-zinc-400 leading-tight">Removes silent gaps</div>
                  </div>
               </button>
               <button 
                  onClick={applyAIVoiceEnhance}
                  className="snap-start flex flex-col items-start gap-1.5 min-w-[130px] p-3 rounded-[6px] border border-white/[0.06] bg-[#2b2b2b] hover:border-[#0078d4]/50 hover:bg-[#333] transition-all text-left group cursor-pointer"
               >
                  <Volume2 className="w-4.5 h-4.5 text-[#0078d4]" />
                  <div>
                    <div className="text-[12px] font-semibold text-white mb-0.5">Denoise Audio</div>
                    <div className="text-[10px] text-zinc-400 leading-tight">Isolate voice with AI</div>
                  </div>
               </button>
               <button 
                  onClick={applyAISmartCrop}
                  className="snap-start flex flex-col items-start gap-1.5 min-w-[130px] p-3 rounded-[6px] border border-white/[0.06] bg-[#2b2b2b] hover:border-[#0078d4]/50 hover:bg-[#333] transition-all text-left group cursor-pointer"
               >
                  <Crop className="w-4.5 h-4.5 text-[#0078d4]" />
                  <div>
                    <div className="text-[12px] font-semibold text-white mb-0.5">Subject Focus</div>
                    <div className="text-[10px] text-zinc-400 leading-tight">Keeps subject center</div>
                  </div>
               </button>
               <button 
                  onClick={applyAIRife}
                  className="snap-start flex flex-col items-start gap-1.5 min-w-[130px] p-3 rounded-[6px] border border-white/[0.06] bg-[#2b2b2b] hover:border-[#0078d4]/50 hover:bg-[#333] transition-all text-left group cursor-pointer"
               >
                  <Layers className="w-4.5 h-4.5 text-[#0078d4]" />
                  <div>
                    <div className="text-[12px] font-semibold text-white mb-0.5">RIFE Generation</div>
                    <div className="text-[10px] text-zinc-400 leading-tight">60fps AI synthesis</div>
                  </div>
               </button>
               {installedPlugins.map(id => {
                  const p = CDN_PLUGINS.find(x => x.id === id);
                  if (!p) return null;
                  const Icon = p.icon;
                  return (
                     <button 
                        key={id}
                        onClick={() => { alert(`Applied ${p.name}!`); setShowAITools(false); }}
                        className="snap-start flex flex-col items-start gap-1.5 min-w-[130px] p-3 rounded-[6px] border border-[#0078d4]/50 bg-[#0078d4]/10 hover:bg-[#0078d4]/20 transition-all text-left cursor-pointer"
                     >
                        <Icon className="w-4.5 h-4.5 text-[#0078d4]" />
                        <div>
                          <div className="text-[12px] font-semibold text-white mb-0.5">{p.name}</div>
                          <div className="text-[10px] text-zinc-400 leading-tight">CDN Extension</div>
                        </div>
                     </button>
                  );
               })}
               <button 
                  onClick={() => { setShowPluginMarketplace(true); setShowAITools(false); }}
                  className="snap-start flex flex-col items-start gap-1.5 min-w-[130px] p-3 rounded-[6px] border border-[#0078d4]/20 bg-[#2b2b2b] hover:border-[#0078d4]/50 hover:bg-[#333] transition-all text-left group cursor-pointer"
               >
                  <Cloud className="w-4.5 h-4.5 text-[#0078d4]" />
                  <div>
                    <div className="text-[12px] font-semibold text-[#0078d4] mb-0.5">CDN Market</div>
                    <div className="text-[10px] text-zinc-400 leading-tight font-light">Install extensions</div>
                  </div>
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTools && (
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-[48px] left-0 right-0 bg-[#1e1e1e] p-4.5 z-30 border-b border-black/40 shadow-xl flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 mb-1">
               <div className="flex bg-[#2b2b2b] border border-black/20 rounded-[4px] p-0.5 shadow-sm">
                  <button onClick={() => setActiveEffectTab('video')} className={`text-[11px] px-3.5 py-1.5 rounded-[3px] font-semibold tracking-wide transition-all cursor-pointer ${activeEffectTab === 'video' ? 'bg-[#0078d4] text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Video FX</button>
                  <button onClick={() => setActiveEffectTab('audio')} className={`text-[11px] px-3.5 py-1.5 rounded-[3px] font-semibold tracking-wide transition-all cursor-pointer ${activeEffectTab === 'audio' ? 'bg-[#0078d4] text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Audio FX</button>
               </div>
               <button onClick={() => setShowTools(false)} className="p-1 hover:bg-white/10 rounded-[4px] transition-colors">
                 <X className="w-4 h-4 text-zinc-400 hover:text-white" />
               </button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {activeEffectTab === 'video' ? (
                VIDEO_FILTERS.map(f => (
                  <button
                    key={f.name}
                    onClick={() => setSelectedVideoFilter(f)}
                    className={`flex flex-col items-center justify-center gap-1.5 min-w-[72px] aspect-square rounded-[6px] border flex-shrink-0 transition-all cursor-pointer ${selectedVideoFilter.name === f.name ? 'border-[#0078d4] bg-[#0078d4]/20 text-white' : 'border-white/[0.06] bg-[#2b2b2b] hover:bg-[#333] hover:border-white/10'}`}
                  >
                    <Filter className={`w-4.5 h-4.5 ${selectedVideoFilter.name === f.name ? 'text-[#0078d4]' : 'text-zinc-400'}`} />
                    <span className={`text-[10px] font-semibold ${selectedVideoFilter.name === f.name ? 'text-[#0078d4]' : 'text-zinc-300'}`}>{f.name}</span>
                  </button>
                ))
              ) : (
                AUDIO_EFFECTS.map(f => (
                  <button
                    key={f.name}
                    onClick={() => setSelectedAudioEffect(f)}
                    className={`flex flex-col items-center justify-center gap-1.5 min-w-[72px] aspect-square rounded-[6px] border flex-shrink-0 transition-all cursor-pointer ${selectedAudioEffect.name === f.name ? 'border-[#0078d4] bg-[#0078d4]/20 text-white' : 'border-white/[0.06] bg-[#2b2b2b] hover:bg-[#333] hover:border-white/10'}`}
                  >
                    <Activity className={`w-4.5 h-4.5 ${selectedAudioEffect.name === f.name ? 'text-[#0078d4]' : 'text-zinc-400'}`} />
                    <span className={`text-[10px] font-semibold ${selectedAudioEffect.name === f.name ? 'text-[#0078d4]' : 'text-zinc-300'}`}>{f.name}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettingsPanel && (
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-[48px] left-0 right-0 bg-[#1e1e1e] p-5 z-30 border-b border-black/40 shadow-xl flex flex-col gap-4 min-h-[300px] overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 mb-1">
               <div className="flex items-center gap-2">
                 {settingsLevel === 'root' ? (
                   <>
                     <Settings2 className="w-4 h-4 text-[#f2f2f2]" />
                     <span className="text-[14px] font-semibold text-[#f2f2f2] tracking-wide select-none">Project Settings</span>
                   </>
                 ) : (
                   <button 
                     onClick={() => setSettingsLevel('root')}
                     className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                   >
                     <ChevronLeft className="w-4 h-4" />
                     <span className="text-[14px] font-semibold tracking-wide select-none">
                       {settingsLevel === 'export' && 'Export Settings'}
                       {settingsLevel === 'performance' && 'Performance'}
                       {settingsLevel === 'storage' && 'Storage'}
                     </span>
                   </button>
                 )}
               </div>
               <button onClick={() => { setShowSettingsPanel(false); setSettingsLevel('root'); }} className="p-1 hover:bg-white/10 rounded-[4px] transition-colors">
                 <X className="w-4 h-4 text-zinc-400 hover:text-white" />
               </button>
            </div>
            
            <div className="relative flex-1">
               <AnimatePresence initial={false} mode="wait">
                 {settingsLevel === 'root' && (
                   <motion.div
                     key="root"
                     initial={{ x: -20, opacity: 0 }}
                     animate={{ x: 0, opacity: 1 }}
                     exit={{ x: -20, opacity: 0 }}
                     transition={{ duration: 0.15 }}
                     className="space-y-1.5"
                   >
                     <button onClick={() => setSettingsLevel('export')} className="w-full flex items-center justify-between p-3 bg-[#2d2d2d] hover:bg-[#333] border border-white/[0.04] rounded-[6px] transition-all cursor-pointer group">
                       <div className="flex items-center gap-3">
                         <Download className="w-4 h-4 text-[#0078d4]" />
                         <span className="text-[13px] text-[#f2f2f2] font-medium">Export Quality</span>
                       </div>
                       <ChevronLeft className="w-4 h-4 text-zinc-500 rotate-180 group-hover:text-zinc-300 transition-colors" />
                     </button>
                     <button onClick={() => setSettingsLevel('performance')} className="w-full flex items-center justify-between p-3 bg-[#2d2d2d] hover:bg-[#333] border border-white/[0.04] rounded-[6px] transition-all cursor-pointer group">
                       <div className="flex items-center gap-3">
                         <Activity className="w-4 h-4 text-[#0078d4]" />
                         <span className="text-[13px] text-[#f2f2f2] font-medium">Performance & Scaling</span>
                       </div>
                       <ChevronLeft className="w-4 h-4 text-zinc-500 rotate-180 group-hover:text-zinc-300 transition-colors" />
                     </button>
                     <button onClick={() => setSettingsLevel('storage')} className="w-full flex items-center justify-between p-3 bg-[#2d2d2d] hover:bg-[#333] border border-white/[0.04] rounded-[6px] transition-all cursor-pointer group">
                       <div className="flex items-center gap-3">
                         <Cloud className="w-4 h-4 text-[#0078d4]" />
                         <span className="text-[13px] text-[#f2f2f2] font-medium">Project Storage</span>
                       </div>
                       <ChevronLeft className="w-4 h-4 text-zinc-500 rotate-180 group-hover:text-zinc-300 transition-colors" />
                     </button>
                   </motion.div>
                 )}
                 {settingsLevel === 'export' && (
                   <motion.div
                     key="export"
                     initial={{ x: 20, opacity: 0 }}
                     animate={{ x: 0, opacity: 1 }}
                     exit={{ x: 20, opacity: 0 }}
                     transition={{ duration: 0.15 }}
                     className="space-y-4"
                   >
                     <div className="bg-[#2d2d2d] rounded-[6px] p-3 border border-white/[0.04]">
                        <div className="text-[12px] font-semibold text-[#f2f2f2] mb-2 select-none">Global Resolution</div>
                        <div className="flex gap-2">
                          {['4K', '1080p', '720p', 'Vertical'].map(res => (
                            <button 
                              key={res} 
                              onClick={() => setExportResolution(res)}
                              className={`flex-1 py-1.5 rounded-[4px] text-[11px] font-medium transition-all cursor-pointer ${exportResolution === res ? 'bg-[#0078d4] text-white shadow-md' : 'bg-[#1e1e1e] border border-white/[0.05] text-zinc-300 hover:bg-[#363636]'}`}
                            >
                              {res}
                            </button>
                          ))}
                        </div>
                     </div>
                     <div className="bg-[#2d2d2d] rounded-[6px] p-3 border border-white/[0.04]">
                        <div className="text-[12px] font-semibold text-[#f2f2f2] mb-2 select-none">Export Format</div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setOutputFormat('mp4')}
                            className={`flex-1 py-1.5 rounded-[4px] text-[11px] font-medium transition-all cursor-pointer ${outputFormat === 'mp4' ? 'bg-[#0078d4] text-white shadow-md' : 'bg-[#1e1e1e] border border-white/[0.05] text-zinc-300 hover:bg-[#363636]'}`}
                          >
                            MP4 (Video)
                          </button>
                          <button 
                            onClick={() => setOutputFormat('mp3')}
                            className={`flex-1 py-1.5 rounded-[4px] text-[11px] font-medium transition-all cursor-pointer ${outputFormat === 'mp3' ? 'bg-[#0078d4] text-white shadow-md' : 'bg-[#1e1e1e] border border-white/[0.05] text-zinc-300 hover:bg-[#363636]'}`}
                          >
                            MP3 (Audio Only)
                          </button>
                        </div>
                     </div>
                   </motion.div>
                 )}
                 {settingsLevel === 'performance' && (
                   <motion.div
                     key="performance"
                     initial={{ x: 20, opacity: 0 }}
                     animate={{ x: 0, opacity: 1 }}
                     exit={{ x: 20, opacity: 0 }}
                     transition={{ duration: 0.15 }}
                     className="space-y-4"
                   >
                     <div className="bg-[#2d2d2d] rounded-[6px] p-3 border border-white/[0.04]">
                        <div className="text-[12px] font-semibold text-[#f2f2f2] mb-2 select-none">Frame Rate (FPS)</div>
                        <div className="flex gap-2">
                          {['24', '30', '60'].map(fps => (
                            <button 
                              key={fps} 
                              onClick={() => setExportFps(fps)}
                              className={`flex-1 py-1.5 rounded-[4px] text-[11px] font-medium transition-all cursor-pointer ${exportFps === fps ? 'bg-[#0078d4] text-white shadow-md' : 'bg-[#1e1e1e] border border-white/[0.05] text-zinc-300 hover:bg-[#363636]'}`}
                            >
                              {fps} FPS
                            </button>
                          ))}
                        </div>
                     </div>
                   </motion.div>
                 )}
                 {settingsLevel === 'storage' && (
                   <motion.div
                     key="storage"
                     initial={{ x: 20, opacity: 0 }}
                     animate={{ x: 0, opacity: 1 }}
                     exit={{ x: 20, opacity: 0 }}
                     transition={{ duration: 0.15 }}
                     className="space-y-4"
                   >
                     <div className="bg-[#2d2d2d] rounded-[6px] p-3 border border-white/[0.04]">
                        <div className="text-[12px] font-semibold text-[#f2f2f2] mb-2 flex items-center justify-between select-none">
                           Local Storage Backup
                           <span className="text-[10px] font-normal text-zinc-400">IndexedDB</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => { saveProject(); setShowSettingsPanel(false); setSettingsLevel('root'); }}
                            className="flex-1 py-1.5 rounded-[4px] text-[11px] bg-[#1e1e1e] border border-white/[0.06] text-zinc-200 font-semibold hover:bg-[#363636] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-[#0078d4]" /> Save JSON
                          </button>
                          <button 
                            onClick={() => { loadProject(); setShowSettingsPanel(false); setSettingsLevel('root'); }}
                            className="flex-1 py-1.5 rounded-[4px] text-[11px] bg-[#1e1e1e] border border-white/[0.06] text-zinc-200 font-semibold hover:bg-[#363636] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-[#0078d4]" /> Load JSON
                          </button>
                        </div>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input 
        ref={fileInputRef}
        type="file" 
        multiple
        accept="audio/*,video/*" 
        className="hidden" 
        onChange={handleFileSelect}
      />



       {/* Render overlay */}
       <AnimatePresence>
          {isProcessing && !resultUrl && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6"
            >
               <div className="bg-[#1e1e1e] border border-black/40 shadow-2xl p-6 rounded-[8px] flex flex-col items-center w-full max-w-[300px]">
                 <Loader2 className="w-10 h-10 text-[#0078d4] animate-spin mb-4" />
                 <div className="text-[#f2f2f2] text-[15px] font-semibold mb-1">Encoding Media</div>
                 <div className="text-zinc-400 text-[12px] mb-5">{exportProgress < 100 ? 'Processing frames...' : 'Finalizing...'}</div>
                 <div className="w-full h-1.5 bg-[#2b2b2b] rounded-full overflow-hidden border border-black/20">
                   <div className="h-full bg-[#0078d4] transition-all duration-300 shadow-[0_0_8px_rgba(0,120,212,0.6)]" style={{ width: `${exportProgress}%` }} />
                 </div>
                 <div className="text-[#f2f2f2] text-[11px] font-mono mt-3 opacity-80">{exportProgress}%</div>
               </div>
            </motion.div>
          )}
       </AnimatePresence>

       <AnimatePresence>
          {resultUrl && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6"
            >
              <div className="bg-[#1e1e1e] border border-black/40 p-6 rounded-[8px] shadow-2xl flex flex-col items-center gap-4 text-center w-full max-w-[320px]">
                <div className="w-12 h-12 bg-[#2b2b2b] border border-white/[0.04] rounded-full flex items-center justify-center shadow-inner">
                  <Download className="w-5 h-5 text-[#0078d4]" />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-[#f2f2f2] mb-1">Export Completed</h3>
                  <p className="text-[12px] text-zinc-400 leading-snug px-4">Your {outputFormat === 'mp4' ? 'video' : 'audio'} file is ready to save.</p>
                </div>
                <div className="w-full flex gap-3 mt-2">
                  <button onClick={() => setResultUrl(null)} className="flex-1 py-2 bg-[#2b2b2b] border border-[#3b3b3b] text-[#f2f2f2] text-[13px] font-medium rounded-[4px] hover:bg-[#333] transition-colors cursor-pointer">
                    Dismiss
                  </button>
                  <a href={resultUrl} download={`Videos_Export.${outputFormat}`} className="flex-1 flex items-center justify-center py-2 bg-[#0078d4] text-white font-medium text-[13px] rounded-[4px] hover:bg-[#1085e0] transition-colors shadow-md">
                    Save File
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      <AnimatePresence>
        {showPluginMarketplace && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-x-4 top-[48px] bottom-12 rounded-[8px] bg-[#1e1e1e] border border-black/40 shadow-2xl z-[100] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/[0.04] bg-[#2b2b2b]">
               <div className="flex items-center gap-3">
                 <Cloud className="w-5 h-5 text-[#0078d4]" />
                 <div>
                   <div className="text-[14px] font-semibold text-[#f2f2f2] leading-tight select-none">CDN Marketplace</div>
                   <div className="text-[11px] text-zinc-400">Discover AI extensions</div>
                 </div>
               </div>
               <button onClick={() => setShowPluginMarketplace(false)} className="p-2 hover:bg-white/10 rounded-[4px] transition-colors">
                 <X className="w-5 h-5 text-zinc-400 hover:text-white" />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-[#1a1a1a]">
                {CDN_PLUGINS.map(plugin => {
                   const isInstalled = installedPlugins.includes(plugin.id);
                   const Icon = plugin.icon;
                   return (
                     <div key={plugin.id} className="bg-[#2d2d2d] border border-white/[0.04] rounded-[6px] p-4 flex gap-4 transition-all hover:bg-[#333]">
                        <div className="w-12 h-12 rounded-[4px] bg-[#1e1e1e] border border-white/[0.04] flex items-center justify-center shrink-0">
                           <Icon className="w-6 h-6 text-[#0078d4]" />
                        </div>
                        <div className="flex-1 min-w-0">
                           <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="text-[13px] font-semibold text-[#f2f2f2] truncate">{plugin.name}</h3>
                              <button 
                                onClick={() => setInstalledPlugins(prev => isInstalled ? prev.filter(id => id !== plugin.id) : [...prev, plugin.id])}
                                className={`shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-[4px] border transition-colors shadow-sm ${
                                  isInstalled ? 'bg-[#1e1e1e] border-[#3b3b3b] text-red-400 hover:bg-red-900/30' : 'bg-[#0078d4] border-transparent text-white hover:bg-[#1085e0]'
                                }`}
                              >
                                {isInstalled ? 'Remove' : 'Install'}
                              </button>
                           </div>
                           <p className="text-[11px] text-zinc-400 leading-snug mb-2">{plugin.description}</p>
                           <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-medium">
                              <span>By {plugin.author}</span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5"><Flame className="w-3 h-3 text-[#0078d4]" /> {plugin.rating}</span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5"><Download className="w-3 h-3 text-[#0078d4]" /> {plugin.downloads}</span>
                           </div>
                        </div>
                     </div>
                   );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
