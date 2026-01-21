import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/autzh';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence, useScroll, useTransform, useSpring, useMotionValue, useVelocity } from 'framer-motion';
import { 
  Upload, File, Trash2, Search, Zap, CheckCircle2, Link as LinkIcon, AlertCircle, Download
} from 'lucide-react';

// Configuration Firebase
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'zk-vault-app';

// --- Particules Réactives Améliorées (Plus de vie) ---
const ParticleBackground = () => {
  const canvasRef = useRef(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationFrame;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2.5 + 0.5; // Un peu plus gros
        this.baseX = this.x;
        this.baseY = this.y;
        this.density = (Math.random() * 40) + 5;
        this.color = Math.random() > 0.8 ? 'rgba(0, 113, 227, 0.5)' : 'rgba(255, 255, 255, 0.2)';
      }
      update() {
        let dx = mouse.current.x - this.x;
        let dy = mouse.current.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let maxDistance = 200;
        
        if (distance < maxDistance) {
          let force = (maxDistance - distance) / maxDistance;
          this.x -= (dx / distance) * force * this.density * 0.5;
          this.y -= (dy / distance) * force * this.density * 0.5;
        } else {
          this.x += (this.baseX - this.x) * 0.05;
          this.y += (this.baseY - this.y) * 0.05;
        }
      }
      draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        // Petite lueur sur les particules
        if (this.size > 2) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
        }
      }
    }

    const init = () => {
      particles = [];
      for (let i = 0; i < 150; i++) particles.push(new Particle());
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });
      animationFrame = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    });

    resize(); init(); animate();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrame); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0 opacity-60" />;
};

const CustomCursor = ({ isHovering }) => {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const x = useSpring(cursorX, { stiffness: 1000, damping: 60 });
  const y = useSpring(cursorY, { stiffness: 1000, damping: 60 });

  useEffect(() => {
    const moveCursor = (e) => { cursorX.set(e.clientX); cursorY.set(e.clientY); };
    window.addEventListener('mousemove', moveCursor);
    return () => window.removeEventListener('mousemove', moveCursor);
  }, []);

  return (
    <motion.div 
      className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference"
      style={{ x, y, translateX: '-50%', translateY: '-50%' }}
    >
      <motion.div 
        animate={{ scale: isHovering ? 4 : 1, backgroundColor: "rgba(255,255,255,1)" }}
        className="w-3 h-3 rounded-full"
      />
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [activeTab, setActiveTab] = useState('files');
  const [status, setStatus] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isHovering, setIsHovering] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [urlError, setUrlError] = useState(false);
  
  const fileInputRef = useRef(null);
  const { scrollY } = useScroll();
  const skew = useTransform(useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 }), [-1000, 1000], [-1, 1]);

  useEffect(() => {
    if (newLink && !(/^(http|https):\/\/[^ "]+$/.test(newLink))) setUrlError(true);
    else setUrlError(false);
  }, [newLink]);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubFiles = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'user_files'), (s) => {
      setFiles(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.createdAt?.seconds - a.createdAt?.seconds));
    });
    const unsubLinks = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'user_links'), (s) => {
      setLinks(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.createdAt?.seconds - a.createdAt?.seconds));
    });
    return () => { unsubFiles(); unsubLinks(); };
  }, [user]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setStatus('uploading');
    let p = 0;
    const timer = setInterval(() => {
      p += 5; setUploadProgress(Math.min(98, p));
      if (p >= 98) clearInterval(timer);
    }, 40);

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'user_files'), {
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
        type: file.type,
        owner: user.uid,
        public: true,
        createdAt: serverTimestamp()
      });
      setUploadProgress(100);
      setStatus('success');
      // RÉINITIALISATION DE L'INPUT pour permettre de remettre le même fichier
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) { setStatus('idle'); }
  };

  const handleAddLink = async () => {
    if (urlError || !newLink || !user) return;
    setStatus('uploading');
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'user_links'), {
        url: newLink,
        name: newLink.replace(/(^\w+:|^)\/\//, '').split('/')[0],
        owner: user.uid,
        public: true,
        createdAt: serverTimestamp()
      });
      setNewLink("");
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) { setStatus('idle'); }
  };

  const deleteItem = async (id, coll) => {
    setIsDeletingId(id);
    setTimeout(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, id));
      setIsDeletingId(null);
    }, 600);
  };

  const handleDownload = (item) => {
    if (item.url) {
      window.open(item.url, '_blank');
    } else {
      const blob = new Blob(["Fichier sécurisé par ZKVault\n\nNom: " + item.name], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen bg-[#000] text-[#f5f5f7] overflow-x-hidden selection:bg-[#0071e3]">
      <ParticleBackground />
      <CustomCursor isHovering={isHovering} />

      {/* Trash Bin - Fixed Position for no layout shift */}
      <AnimatePresence>
        {isDeletingId && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.2 }}
            exit={{ opacity: 0, scale: 0 }}
            className="fixed top-10 right-10 z-[100] bg-red-600 w-20 h-20 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.4)] border-2 border-white/20"
          >
            <Trash2 size={28} className="text-white animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-8 h-20 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Zap size={22} className="text-[#0071e3] fill-[#0071e3]" />
            <span className="font-black text-xl tracking-tighter">ZKVAULT</span>
          </div>
          <div className="bg-[#1d1d1f] p-1 rounded-full flex relative border border-white/10 scale-90 md:scale-100">
            <motion.div 
              layoutId="nav"
              className="absolute bg-[#323236] rounded-full h-[calc(100%-8px)] my-auto"
              style={{ width: 'calc(50% - 4px)', left: activeTab === 'files' ? '4px' : 'calc(50%)' }}
            />
            <button onClick={() => setActiveTab('files')} className={`relative z-10 px-6 py-1.5 text-[10px] font-black uppercase tracking-widest ${activeTab === 'files' ? 'text-white' : 'text-[#86868b]'}`}>Fichiers</button>
            <button onClick={() => setActiveTab('links')} className={`relative z-10 px-6 py-1.5 text-[10px] font-black uppercase tracking-widest ${activeTab === 'links' ? 'text-white' : 'text-[#86868b]'}`}>Liens</button>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#0071e3] to-[#5ac8fa] opacity-80" />
        </div>
      </nav>

      <motion.main style={{ skewY: skew }} className="relative z-10">
        <section className="h-screen flex flex-col items-center justify-center px-6">
          <motion.h1 
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            className="text-[12vw] md:text-[9vw] font-black tracking-tighter leading-[0.85] mb-16 text-center bg-clip-text text-transparent bg-gradient-to-b from-white to-white/10"
          >
            VOTRE CLOUD<br /><span className="text-[#0071e3]">INFINI.</span>
          </motion.h1>

          <div className="flex justify-center w-full max-w-2xl px-4">
            <AnimatePresence mode="wait">
              {activeTab === 'files' ? (
                <motion.label key="f" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="cursor-pointer">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} disabled={status !== 'idle'} />
                  <motion.div 
                    onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}
                    animate={{ backgroundColor: status === 'success' ? '#34c759' : '#fff', width: status === 'idle' ? 320 : 280 }}
                    className="h-20 rounded-full flex items-center justify-center gap-4 shadow-[0_20px_50px_rgba(255,255,255,0.1)] transition-all"
                  >
                    {status === 'idle' ? <><Upload className="text-black" size={20} /><span className="text-black font-black uppercase tracking-[0.2em] text-xs">Importer</span></> : <span className="text-black font-black text-2xl">{uploadProgress}%</span>}
                  </motion.div>
                </motion.label>
              ) : (
                <motion.div key="l" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full relative flex items-center">
                  <input 
                    type="text" value={newLink} onChange={(e) => setNewLink(e.target.value)}
                    placeholder="Coller l'URL publique..."
                    className={`w-full h-16 md:h-20 bg-[#1c1c1e] rounded-[24px] px-8 border ${urlError ? 'border-red-500' : 'border-white/10'} outline-none focus:ring-1 ring-[#0071e3] transition-all text-sm font-medium pr-32`}
                  />
                  <button 
                    onClick={handleAddLink} disabled={urlError || !newLink}
                    onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}
                    className="absolute right-2 top-2 bottom-2 px-6 bg-white text-black rounded-[18px] font-black uppercase text-[10px] tracking-widest hover:bg-[#f5f5f7] disabled:opacity-30 transition-all"
                  >
                    Ajouter
                  </button>
                  {urlError && <p className="absolute -bottom-8 left-4 text-red-500 text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><AlertCircle size={10}/> URL non valide</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <section className="py-20 px-6 md:px-20 max-w-[1400px] mx-auto min-h-screen">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-24 border-b border-white/5 pb-12 gap-6">
            <div>
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter">Librairie</h2>
                <p className="text-[#86868b] text-xs font-bold uppercase tracking-[0.3em] mt-2">Accès Public Partagé</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#424245]" size={16} />
              <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#1c1c1e]/50 border border-white/5 rounded-full py-3 pl-12 pr-6 outline-none text-sm focus:border-white/20 transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode="popLayout">
              {(activeTab === 'files' ? files : links)
                .filter(i => (i.name || i.url).toLowerCase().includes(searchQuery.toLowerCase()))
                .map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={isDeletingId === item.id ? { 
                    opacity: 0, scale: 0.2, x: 200, y: -400, rotate: 25, filter: 'blur(20px)',
                    transition: { duration: 0.5, ease: "backIn" }
                  } : { opacity: 0, scale: 0.95 }}
                  className="group relative"
                >
                  <div className="bg-[#1c1c1e]/40 backdrop-blur-2xl rounded-[32px] p-8 h-[340px] flex flex-col border border-white/5 hover:border-[#0071e3]/30 transition-all duration-500 shadow-2xl">
                    <div className="flex justify-between items-start">
                      <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-[#0071e3] transition-all duration-500">
                        {activeTab === 'files' ? <File size={22} /> : <LinkIcon size={22} />}
                      </div>
                      <button onClick={() => deleteItem(item.id, activeTab === 'files' ? 'user_files' : 'user_links')} className="p-2 text-[#424245] hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-auto">
                      <h3 className="text-lg font-bold truncate mb-2 group-hover:text-white transition-colors">{item.name}</h3>
                      <div className="flex gap-2 mb-8">
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-white/5 rounded text-[#86868b] border border-white/5">{activeTab === 'files' ? item.size : 'Web Link'}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-green-500/10 rounded text-green-500 border border-green-500/10">Public</span>
                      </div>
                      <button 
                        onClick={() => handleDownload(item)}
                        onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}
                        className="w-full py-4 bg-white/5 group-hover:bg-white text-white group-hover:text-black rounded-2xl font-black uppercase text-[9px] tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-500"
                      >
                        {activeTab === 'files' ? "Télécharger" : "Ouvrir"}
                        <Download size={12} className="opacity-50 group-hover:opacity-100" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      </motion.main>

      <footer className="py-20 border-t border-white/5 text-center relative z-10">
          <div className="flex items-center justify-center gap-2 mb-4 opacity-30">
              <Zap size={14} />
              <span className="text-[8px] font-black tracking-[0.4em] uppercase">Powered by ZKVault Neural</span>
          </div>
        <p className="text-[9px] font-bold text-[#424245] uppercase tracking-[0.2em]">Designed in Quebec • 2026</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; background: #000; cursor: none; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        * { cursor: none !important; }
      `}} />
    </div>
  );
}