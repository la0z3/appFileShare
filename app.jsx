import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, serverTimestamp, query } from 'firebase/firestore';
import { motion, AnimatePresence, useSpring, useMotionValue, useScroll, useTransform } from 'framer-motion';
import { 
  Upload, File, Trash2, Zap, Link as LinkIcon, Download, ChevronDown
} from 'lucide-react';

// Configuration Firebase (Injectée par l'environnement)
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'zk-vault-app';

const ParticleBackground = () => {
  const canvasRef = useRef(null);
  const mouse = useRef({ x: -1000, y: -1000 });

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
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.baseX = this.x;
        this.baseY = this.y;
        this.size = Math.random() * 2 + 0.5;
        this.density = (Math.random() * 30) + 5;
        this.color = Math.random() > 0.5 ? '#0071e3' : '#ffffff';
        this.opacity = Math.random() * 0.4 + 0.1;
      }
      update() {
        let dx = mouse.current.x - this.x;
        let dy = mouse.current.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let maxDistance = 150;
        if (distance < maxDistance) {
          let force = (maxDistance - distance) / maxDistance;
          this.x -= (dx / distance) * force * this.density;
          this.y -= (dy / distance) * force * this.density;
        } else {
          this.x -= (this.x - this.baseX) / 20;
          this.y -= (this.y - this.baseY) / 20;
        }
      }
      draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const init = () => {
      particles = [];
      const count = (canvas.width * canvas.height) / 12000;
      for (let i = 0; i < count; i++) particles.push(new Particle());
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });
      animationFrame = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', () => { resize(); init(); });
    window.addEventListener('mousemove', (e) => { mouse.current = { x: e.clientX, y: e.clientY }; });
    resize(); init(); animate();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrame); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
};

const CustomCursor = ({ isHovering }) => {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const x = useSpring(cursorX, { stiffness: 1000, damping: 60 });
  const y = useSpring(cursorY, { stiffness: 1000, damping: 60 });

  useEffect(() => {
    const move = (e) => { cursorX.set(e.clientX); cursorY.set(e.clientY); };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <motion.div className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference" style={{ x, y, translateX: '-50%', translateY: '-50%' }}>
      <motion.div animate={{ scale: isHovering ? 2.5 : 1 }} className="w-5 h-5 bg-white rounded-full" />
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [activeTab, setActiveTab] = useState('files');
  const [status, setStatus] = useState('idle');
  const [isHovering, setIsHovering] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [isDeletingId, setIsDeletingId] = useState(null);
  
  const contentRef = useRef(null);

  const { scrollY } = useScroll();
  const titleY = useTransform(scrollY, [0, 600], [0, -200]);
  const opacityTitle = useTransform(scrollY, [0, 450], [1, 0]);
  const scaleTitle = useTransform(scrollY, [0, 450], [1, 0.8]);
  const blurTitle = useTransform(scrollY, [0, 450], ["blur(0px)", "blur(25px)"]);

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
    const qFiles = query(collection(db, 'artifacts', appId, 'public', 'data', 'user_files'));
    const qLinks = query(collection(db, 'artifacts', appId, 'public', 'data', 'user_links'));
    const unsubFiles = onSnapshot(qFiles, (s) => setFiles(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => console.error(err));
    const unsubLinks = onSnapshot(qLinks, (s) => setLinks(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => console.error(err));
    return () => { unsubFiles(); unsubLinks(); };
  }, [user]);

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    // LIMITE 5 GO (5,368,709,120 octets)
    if (file.size > 5368709120) {
      alert("Fichier trop volumineux. La limite est de 5 GO.");
      return;
    }

    setStatus('uploading');
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'user_files'), {
        name: file.name,
        size: file.size > 1073741824 
          ? (file.size / (1024 * 1024 * 1024)).toFixed(2) + " GB"
          : (file.size / (1024 * 1024)).toFixed(2) + " MB",
        createdAt: serverTimestamp()
      });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 1000);
    } catch (err) { setStatus('idle'); }
  };

  const handleAddLink = async () => {
    if (!newLink.trim() || !user) return;
    setStatus('uploading');
    let url = newLink.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'user_links'), {
        url: url,
        name: url.split('//')[1]?.split('/')[0] || url,
        createdAt: serverTimestamp()
      });
      setNewLink("");
      setStatus('success');
      setTimeout(() => setStatus('idle'), 1000);
    } catch (err) { setStatus('idle'); }
  };

  const deleteItem = async (id, coll) => {
    setIsDeletingId(id);
    setTimeout(async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, id));
      } catch (e) { console.error(e); }
      setIsDeletingId(null);
    }, 850);
  };

  const onDownload = (item) => {
    if (item.url) {
      window.open(item.url, '_blank');
    } else {
      const blob = new Blob(["ZKVault Secure Asset Content"], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name || 'document.txt';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-[250vh] bg-black text-[#f5f5f7] selection:bg-[#0071e3] font-sans">
      <ParticleBackground />
      <CustomCursor isHovering={isHovering} />

      {/* Animation de suppression "Magnétique" */}
      <AnimatePresence>
        {isDeletingId && (
          <motion.div 
            initial={{ opacity: 0, scale: 0, rotate: -90, x: 100 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              rotate: [0, -15, 15, 0],
              x: 0,
              transition: { type: 'spring', stiffness: 300, damping: 20 }
            }}
            exit={{ opacity: 0, scale: 0, transition: { duration: 0.2 } }}
            className="fixed top-10 right-10 z-[100] w-28 h-28 bg-red-600 rounded-[35px] flex items-center justify-center shadow-[0_0_60px_rgba(220,38,38,0.6)] border border-white/30"
          >
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}>
              <Trash2 size={45} className="text-white" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-10 h-24 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Zap size={22} className="text-[#0071e3] fill-[#0071e3]" />
            <span className="font-black text-xl tracking-tighter italic uppercase">ZKVAULT</span>
          </div>
          <div className="bg-[#1d1d1f] p-1 rounded-2xl flex border border-white/10">
            {['files', 'links'].map((tab) => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-black' : 'text-[#86868b] hover:text-white'}`}
              >
                {tab === 'files' ? 'Cloud' : 'Liaisons'}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* SECTION TITRE AVEC EFFET DE FLOU AU SCROLL */}
      <section className="h-screen flex flex-col items-center justify-center sticky top-0 z-10 pointer-events-none">
        <motion.div 
            style={{ y: titleY, opacity: opacityTitle, scale: scaleTitle, filter: blurTitle }} 
            className="text-center"
        >
            <h1 className="text-[13vw] font-black leading-[0.8] tracking-tighter mb-8 select-none text-white">
                ASSET<br /><span className="text-[#0071e3]">CONTROL.</span>
            </h1>
            <p className="text-[#86868b] text-2xl font-medium tracking-tight italic">Capacité 5 GB. Puissance Illimitée.</p>
            
            {/* BOUTON DÉFILER TRÈS VISIBLE */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-20 pointer-events-auto"
            >
              <motion.button 
                onClick={scrollToContent}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                animate={{ 
                  y: [0, 15, 0],
                  scale: [1, 1.05, 1],
                  boxShadow: [
                    "0 0 0px rgba(0, 113, 227, 0)",
                    "0 0 30px rgba(0, 113, 227, 0.3)",
                    "0 0 0px rgba(0, 113, 227, 0)"
                  ]
                }} 
                transition={{ 
                  y: { repeat: Infinity, duration: 2, ease: "easeInOut" },
                  scale: { repeat: Infinity, duration: 3, ease: "easeInOut" },
                  boxShadow: { repeat: Infinity, duration: 2 }
                }}
                className="flex flex-col items-center gap-4 group"
              >
                <span className="text-[14px] uppercase tracking-[0.6em] font-black text-white group-hover:text-[#0071e3] transition-all">
                  Défiler vers le dépôt
                </span>
                <div className="w-20 h-20 rounded-full bg-[#0071e3] border-4 border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-300 shadow-2xl">
                  <ChevronDown size={32} strokeWidth={4} />
                </div>
              </motion.button>
            </motion.div>
        </motion.div>
      </section>

      {/* ZONE DE CONTENU (FORMULAIRE + GRILLE) */}
      <section ref={contentRef} className="relative z-20 min-h-screen pt-[30vh] px-8 max-w-[1500px] mx-auto">
        
        {/* BOITE D'IMPORTATION */}
        <div className="max-w-2xl mx-auto mb-48">
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="bg-[#1c1c1e]/90 backdrop-blur-3xl p-12 rounded-[50px] border border-white/10 shadow-[0_50px_100px_rgba(0,0,0,0.5)]"
            >
                <h2 className="text-3xl font-black mb-10 text-center tracking-tight text-white uppercase">Système de dépôt</h2>
                {activeTab === 'files' ? (
                    <label className="block group cursor-pointer" onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                        <motion.div whileHover={{ scale: 1.02 }} className="h-28 rounded-3xl bg-white flex items-center justify-center gap-5 shadow-2xl">
                            <Upload className="text-black" size={30} />
                            <span className="text-black font-black uppercase text-base tracking-[0.2em]">Importer (Limite 5GB)</span>
                        </motion.div>
                    </label>
                ) : (
                    <div className="flex flex-col gap-5">
                        <input 
                            type="text" 
                            value={newLink} 
                            onChange={(e) => setNewLink(e.target.value)} 
                            placeholder="Saisir l'URL sécurisée..." 
                            className="w-full h-20 bg-black/50 border border-white/10 rounded-2xl px-8 outline-none focus:border-[#0071e3] transition-all font-bold text-white text-xl" 
                        />
                        <button 
                            onClick={handleAddLink} 
                            className="h-20 bg-[#0071e3] text-white rounded-2xl font-black uppercase text-xs tracking-[0.3em] hover:bg-white hover:text-black transition-all shadow-xl shadow-[#0071e3]/20"
                        >
                            Enregistrer le lien
                        </button>
                    </div>
                )}
            </motion.div>
        </div>

        {/* GRILLE DES ASSETS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 pb-80">
          <AnimatePresence mode="popLayout">
            {(activeTab === 'files' ? files : links).map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ margin: "-50px" }}
                transition={{ delay: (idx % 3) * 0.1, duration: 0.6 }}
                exit={{ 
                  opacity: [1, 0.8, 0],
                  scale: [1, 0.5, 0],
                  x: [0, window.innerWidth * 0.3, window.innerWidth * 0.45], 
                  y: [0, -window.innerHeight * 0.4, -window.innerHeight * 0.5], 
                  rotate: [0, 45, 180],
                  transition: { duration: 0.8, ease: [0.32, 0, 0.67, 0] }
                }}
                className="bg-[#1c1c1e] p-12 rounded-[50px] border border-white/5 group relative hover:border-[#0071e3]/40 transition-all duration-700"
              >
                <div className="flex justify-between items-start mb-20">
                  <div className="w-20 h-20 bg-[#0071e3]/10 rounded-[28px] flex items-center justify-center text-[#0071e3] group-hover:bg-[#0071e3] group-hover:text-white transition-all duration-500">
                    {activeTab === 'files' ? <File size={34} /> : <LinkIcon size={34} />}
                  </div>
                  <button 
                    onClick={() => deleteItem(item.id, activeTab === 'files' ? 'user_files' : 'user_links')} 
                    className="p-4 text-[#424245] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  >
                    <Trash2 size={24} />
                  </button>
                </div>

                <div className="space-y-3 mb-16">
                    <h3 className="text-3xl font-black tracking-tighter leading-none truncate text-white uppercase">{item.name}</h3>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#0071e3]" />
                        <p className="text-[11px] font-black uppercase text-[#86868b] tracking-[0.4em]">
                            {activeTab === 'files' ? item.size : 'Lien Resource'}
                        </p>
                    </div>
                </div>

                <button 
                  onClick={() => onDownload(item)} 
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  className="w-full py-6 bg-white/5 group-hover:bg-white group-hover:text-black rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] transition-all flex items-center justify-center gap-4 text-white"
                >
                  {activeTab === 'links' ? 'Visiter' : 'Récupérer'} <Download size={18} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      <footer className="fixed bottom-12 left-12 z-50 text-[11px] font-black uppercase tracking-[0.5em] opacity-20 select-none vertical-text text-white">
          ZKVAULT // STUDIO_CORE_ENGINE
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; background: #000; margin: 0; cursor: none !important; }
        ::-webkit-scrollbar { width: 0px; }
        html { scroll-behavior: smooth; }
        .vertical-text { writing-mode: vertical-rl; transform: rotate(180deg); }
      `}} />
    </div>
  );
}
