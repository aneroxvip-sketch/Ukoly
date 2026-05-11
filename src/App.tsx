/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  getDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, loginAnonymously, loginWithGoogle } from './firebase';
import { 
  Layout, 
  BookOpen, 
  Plus, 
  MessageSquare, 
  UserX, 
  LogOut, 
  Key, 
  User, 
  AlertTriangle,
  Send,
  Trash2,
  Bell,
  Pencil,
  X,
  CheckCircle2,
  Circle,
  Book,
  Calculator,
  Languages,
  Beaker,
  Music,
  Palette,
  Dumbbell,
  Globe,
  History,
  Atom,
  Code,
  Laptop,
  GraduationCap,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface Ukol {
  id: string;
  predmet: string;
  strana: string;
  cviceni: string;
  createdAt: any;
  createdBy: string;
  icon?: string;
}

interface Zprava {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  customId: string;
  lastActive: any;
  completedTasks?: string[];
}

enum Role {
  NONE = 'none',
  HOST = 'host',
  ADMIN = 'admin'
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

const ICON_LIST = [
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Book', icon: Book },
  { name: 'Calculator', icon: Calculator },
  { name: 'Languages', icon: Languages },
  { name: 'Beaker', icon: Beaker },
  { name: 'Music', icon: Music },
  { name: 'Palette', icon: Palette },
  { name: 'Dumbbell', icon: Dumbbell },
  { name: 'Globe', icon: Globe },
  { name: 'History', icon: History },
  { name: 'Atom', icon: Atom },
  { name: 'Code', icon: Code },
  { name: 'Laptop', icon: Laptop },
  { name: 'GraduationCap', icon: GraduationCap },
  { name: 'Sparkles', icon: Sparkles }
];

const TaskIcon = ({ name, className }: { name?: string, className?: string }) => {
  const item = ICON_LIST.find(i => i.name === name);
  const Icon = item ? item.icon : BookOpen;
  return <Icon className={className} />;
};

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
};

const generateUniqueId = () => {
  const hash = Math.random().toString(16).substring(2, 9);
  const suffix = Math.floor(Math.random() * 9) + 1;
  return `id#${hash}/${suffix}*`;
};

export default function App() {
  const [role, setRole] = useState<Role>(Role.NONE);
  const [user, setUser] = useState<any>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [tasks, setTasks] = useState<Ukol[]>([]);
  const [messages, setMessages] = useState<Zprava[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [customId, setCustomId] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Ukol | null>(null);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  
  const [activeTab, setActiveTab] = useState<'tasks' | 'messages' | 'users'>('tasks');
  
  const [password, setPassword] = useState('');
  const [newPredmet, setNewPredmet] = useState('');
  const [newStrana, setNewStrana] = useState('');
  const [newCviceni, setNewCviceni] = useState('');
  const [newIcon, setNewIcon] = useState('BookOpen');
  const [feedback, setFeedback] = useState('');
  const [banUserId, setBanUserId] = useState('');

  const [notif, setNotif] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setAuthError(null);
        let cid = localStorage.getItem('ukoly_custom_id');
        if (!cid) {
          cid = generateUniqueId();
          localStorage.setItem('ukoly_custom_id', cid);
        }
        setCustomId(cid);

        // Register user
        try {
          await setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            customId: cid,
            lastActive: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, 'users');
        }

        // Check if Admin
        try {
          const adminRef = doc(db, 'admins', u.uid);
          const snap = await getDoc(adminRef);
          if (snap.exists()) {
            setRole(Role.ADMIN);
          }
        } catch (e) {
          // Normal users get permission denied here, ignore
        }

        // Check if Banned
        const banUnsub = onSnapshot(doc(db, 'bans', u.uid), (snap) => {
          setIsBanned(snap.exists());
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `bans/${u.uid}`);
        });

        // Sync completed tasks
        const userUnsub = onSnapshot(doc(db, 'users', u.uid), (snap) => {
          if (snap.exists()) {
            setCompletedTasks(snap.data().completedTasks || []);
          }
        });

        return () => {
          banUnsub();
          userUnsub();
        };
      }
    });
    return () => unsub();
  }, []);

  const handleHostLogin = async () => {
    try {
      await loginAnonymously();
      setRole(Role.HOST);
    } catch (e: any) {
      if (e.message?.includes('admin-restricted-operation')) {
        setAuthError('Anonymní přihlašování není ve vaší Firebase konzoli povoleno. Můžete se přihlásit přes Google nebo kontaktovat správce.');
      } else {
        alert('Chyba při přihlašování: ' + (e.message || 'Neznámá chyba'));
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      setAuthError(null);
      setRole(Role.HOST);
    } catch (e: any) {
      alert('Chyba Google přihlášení: ' + e.message);
    }
  };

  // Real-time Tasks
  useEffect(() => {
    if (!user || isBanned) return;
    const q = query(collection(db, 'ukoly'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const u: Ukol[] = [];
      snap.forEach((doc) => {
        u.push({ id: doc.id, ...doc.data() } as Ukol);
      });
      setTasks(prev => {
        if (prev.length > 0 && u.length > prev.length) {
          const newTask = u[0];
          setNotif(`Nový úkol: ${newTask.predmet} - str. ${newTask.strana}`);
          setTimeout(() => setNotif(null), 5000);
        }
        return u;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ukoly');
    });
    return () => unsub();
  }, [user, isBanned]);

  // Real-time Messages & Users (Admin only)
  useEffect(() => {
    if (role !== Role.ADMIN || !user) return;
    
    const qMsg = query(collection(db, 'zpravy'), orderBy('createdAt', 'desc'));
    const unsubMsg = onSnapshot(qMsg, (snap) => {
      const m: Zprava[] = [];
      snap.forEach((doc) => m.push({ id: doc.id, ...doc.data() } as Zprava));
      setMessages(m);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'zpravy'));

    const qUsers = collection(db, 'users');
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      const us: UserProfile[] = [];
      snap.forEach((doc) => us.push(doc.data() as UserProfile));
      setAllUsers(us);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubMsg();
      unsubUsers();
    };
  }, [role, user]);

  const handleAdminLogin = async () => {
    if (password === '147258369ADMIN' && user) {
      try {
        await setDoc(doc(db, 'admins', user.uid), {
          secret: password,
          role: 'admin',
          createdAt: serverTimestamp()
        });
        setRole(Role.ADMIN);
        setPassword('');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'admins');
      }
    } else {
      alert('Špatné heslo!');
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPredmet || !newStrana || !newCviceni) return;
    try {
      if (editingTask) {
        await updateDoc(doc(db, 'ukoly', editingTask.id), {
          predmet: newPredmet,
          strana: newStrana,
          cviceni: newCviceni,
          icon: newIcon,
          updatedAt: serverTimestamp()
        });
        setEditingTask(null);
        alert('Úkol byl aktualizován.');
      } else {
        await addDoc(collection(db, 'ukoly'), {
          predmet: newPredmet,
          strana: newStrana,
          cviceni: newCviceni,
          icon: newIcon,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
      }
      setNewPredmet('');
      setNewStrana('');
      setNewCviceni('');
      setNewIcon('BookOpen');
    } catch (err) {
      handleFirestoreError(err, editingTask ? OperationType.UPDATE : OperationType.CREATE, 'ukoly');
      alert('Chyba: Nemáte oprávnění k této operaci.');
    }
  };

  const startEditing = (task: Ukol) => {
    setEditingTask(task);
    setNewPredmet(task.predmet);
    setNewStrana(task.strana);
    setNewCviceni(task.cviceni);
    setNewIcon(task.icon || 'BookOpen');
    const el = document.getElementById('add-task-form');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingTask(null);
    setNewPredmet('');
    setNewStrana('');
    setNewCviceni('');
    setNewIcon('BookOpen');
  };

  const sendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback) return;
    try {
      await addDoc(collection(db, 'zpravy'), {
        text: feedback,
        senderId: customId,
        senderUid: user.uid,
        createdAt: serverTimestamp()
      });
      setFeedback('');
      alert('Zpráva odeslána adminům.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'zpravy');
      alert('Zprávu se nepodařilo odeslat.');
    }
  };

  const toggleBan = async (uidToBan: string) => {
    const isCurrentlyBanned = await (await getDoc(doc(db, 'bans', uidToBan))).exists();
    try {
      if (isCurrentlyBanned) {
        await deleteDoc(doc(db, 'bans', uidToBan));
        alert('Uživatel odbanován.');
      } else {
        await setDoc(doc(db, 'bans', uidToBan), {
          userId: uidToBan,
          bannedAt: serverTimestamp()
        });
        alert('Uživatel zabanován.');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bans');
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ukoly', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `ukoly/${id}`);
    }
  };

  const toggleTaskCompletion = async (taskId: string) => {
    if (!user) return;
    const isCompleted = completedTasks.includes(taskId);
    const updated = isCompleted 
      ? completedTasks.filter(id => id !== taskId)
      : [...completedTasks, taskId];
    
    try {
      await setDoc(doc(db, 'users', user.uid), {
        completedTasks: updated,
        lastActive: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  if (isBanned) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-2xl text-center max-w-md border-4 border-red-500">
          <AlertTriangle className="w-20 h-20 text-red-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-red-700 mb-2 font-black tracking-tight">PŘÍSTUP ZAMÍTNUT</h1>
          <p className="text-gray-600 mb-6">Vaše ID: <span className="font-mono font-bold text-slate-900">{customId}</span> bylo zabanováno administrátorem.</p>
        </div>
      </div>
    );
  }

  if (role === Role.NONE) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-black text-blue-600 tracking-tighter mb-1 uppercase italic">ukoly</h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Školní Správce</p>
          </div>
          
          <div className="space-y-6">
            {!authError ? (
              <button 
                onClick={handleHostLogin} 
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 group"
              >
                <User className="w-5 h-5" />
                <span>Vstoupit jako Host</span>
              </button>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-center">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">Anonymní přístup je zakázán</p>
                <button 
                  onClick={handleGoogleLogin} 
                  className="w-full bg-white text-slate-800 border-2 border-slate-200 p-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="G" />
                  Přihlásit přes Google
                </button>
              </div>
            )}

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest"><span className="bg-white px-4 text-slate-400">Správa systému</span></div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                <input 
                  type="password" 
                  placeholder="Administrátorské heslo" 
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-700" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} 
                />
              </div>
              <button 
                onClick={handleAdminLogin} 
                className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold hover:bg-black transition-all shadow-xl"
              >
                Přihlásit se jako Admin
              </button>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-[0.2em]">ID: {customId || 'Načítání...'}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden text-slate-900">
      <AnimatePresence>
        {notif && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-6 right-1/2 translate-x-1/2 md:right-8 md:translate-x-0 z-50 w-full max-w-sm">
            <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-4 border border-slate-700">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bell className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Systémové oznámení</p>
                <p className="text-sm font-medium">{notif}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Nav */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-black tracking-tight text-blue-400 uppercase italic">ukoly</h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">Online Přehled</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all ${activeTab === 'tasks' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="font-semibold text-sm">Přehled úkolů</span>
          </button>
          
          {role === Role.ADMIN && (
            <>
              <button 
                onClick={() => setActiveTab('messages')}
                className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all ${activeTab === 'messages' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <MessageSquare className="w-5 h-5" />
                <span className="font-semibold text-sm">Zprávy od hostů</span>
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <UserX className="w-5 h-5" />
                <span className="font-semibold text-sm">Správa hostů</span>
              </button>
            </>
          )}

          {role === Role.HOST && (
             <button 
                onClick={() => setActiveTab('messages')}
                className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all ${activeTab === 'messages' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:bg-slate-800'}`}
              >
              <Send className="w-5 h-5" />
              <span className="font-semibold text-sm">Poslat zprávu</span>
            </button>
          )}
        </nav>
        <div className="p-6 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-xs font-black shadow-lg shadow-blue-900/50">
              {role === Role.ADMIN ? 'AD' : 'HO'}
            </div>
            <div className="overflow-hidden">
              <p className="font-bold text-xs truncate capitalize">{role === Role.ADMIN ? 'Administrátor' : 'Vstoupil Host'}</p>
              <p className="text-slate-500 text-[10px] font-mono truncate">{customId}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sekce:</span>
            <span className="font-black text-slate-800 uppercase tracking-tight italic">
              {activeTab === 'tasks' ? 'Aktuální úkoly' : activeTab === 'messages' ? 'Komunikace' : 'Správa uživatelů'}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setRole(Role.NONE)}
              className="px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all active:scale-95"
            >
              Odhlásit
            </button>
            {role === Role.ADMIN && activeTab === 'tasks' && (
              <button 
                onClick={() => {
                  const el = document.getElementById('add-task-form');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-600/30 hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:scale-95 italic"
              >
                + Přidat úkol
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'tasks' && (
              <motion.div 
                key="tasks-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Task Table Style Section */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="font-black text-sm uppercase tracking-widest text-slate-700">Seznam aktivních úkolů</h2>
                    <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black uppercase tracking-tighter">
                      {tasks.length} AKTIVNÍ
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="text-[10px] text-slate-400 uppercase tracking-widest font-black bg-white border-b border-slate-100">
                        <tr>
                          <th className="p-6 font-black">Předmět</th>
                          <th className="p-6 font-black text-center">Strana</th>
                          <th className="p-6 font-black text-center">Cvičení</th>
                          <th className="p-6 font-black text-right">Přidáno</th>
                          {role === Role.ADMIN && <th className="p-6 font-black text-right">Akce</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 italic font-medium">
                        {tasks.length === 0 ? (
                          <tr><td colSpan={5} className="p-12 text-center text-slate-300 font-bold uppercase tracking-widest">Žádné úkoly k zobrazení</td></tr>
                        ) : (
                          tasks.map((task) => {
                            const isDone = completedTasks.includes(task.id);
                            return (
                              <tr key={task.id} className={`hover:bg-slate-50/50 transition-colors group ${isDone ? 'opacity-40' : ''}`}>
                                <td className="p-6 border-l-4 border-l-transparent group-hover:border-l-blue-600">
                                  <div className="flex items-center gap-3">
                                    <button 
                                      onClick={() => toggleTaskCompletion(task.id)}
                                      className={`transition-colors ${isDone ? 'text-green-500' : 'text-slate-300 hover:text-blue-500'}`}
                                    >
                                      {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                                    </button>
                                    <div className={`p-2 rounded-lg bg-slate-100 text-slate-500 ${isDone ? 'opacity-30' : ''}`}>
                                      <TaskIcon name={task.icon} className="w-4 h-4" />
                                    </div>
                                    <span className={`font-black text-slate-800 text-sm uppercase ${isDone ? 'line-through' : ''}`}>
                                      {task.predmet}
                                    </span>
                                  </div>
                                </td>
                                <td className={`p-6 text-center ${isDone ? 'line-through' : ''}`}>
                                  <span className="bg-slate-100 px-3 py-1 rounded-md text-slate-700 font-bold text-xs">{task.strana}</span>
                                </td>
                                <td className={`p-6 text-center text-slate-600 text-sm ${isDone ? 'line-through' : ''}`}>{task.cviceni}</td>
                                <td className="p-6 text-right text-[10px] text-slate-400 font-mono tracking-tighter">
                                  {task.createdAt?.toDate().toLocaleDateString('cs-CZ')}
                                </td>
                                {role === Role.ADMIN && (
                                  <td className="p-6 text-right">
                                    <div className="flex justify-end gap-2">
                                      <button 
                                        onClick={() => startEditing(task)}
                                        className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => deleteTask(task.id)}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {role === Role.ADMIN && (
                  <section id="add-task-form" className={`bg-white rounded-xl shadow-sm border p-8 transition-all duration-500 ${editingTask ? 'border-blue-500 ring-2 ring-blue-50' : 'border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                        {editingTask ? 'Upravit existující úkol' : 'Rychlé přidání úkolu'}
                      </h3>
                      {editingTask && (
                        <button 
                          onClick={cancelEditing}
                          className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Zrušit úpravy
                        </button>
                      )}
                    </div>
                    <form onSubmit={addTask} className="grid grid-cols-1 md:grid-cols-5 gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ikona</label>
                        <div className="flex flex-wrap gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl max-h-[100px] overflow-y-auto">
                          {ICON_LIST.map(item => (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => setNewIcon(item.name)}
                              className={`p-2 rounded-lg transition-all ${newIcon === item.name ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-200'}`}
                              title={item.name}
                            >
                              <item.icon className="w-4 h-4" />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Předmět</label>
                        <input placeholder="Např. Matika" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold" value={newPredmet} onChange={(e) => setNewPredmet(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Strana</label>
                        <input placeholder="Např. 420" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold" value={newStrana} onChange={(e) => setNewStrana(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cvičení</label>
                        <input placeholder="Např. 8 a, b" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold" value={newCviceni} onChange={(e) => setNewCviceni(e.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <button className={`w-full text-white p-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 ${editingTask ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200 hover:-translate-y-0.5' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30 hover:-translate-y-0.5'}`}>
                          {editingTask ? 'Uložit změny' : 'Uložit úkol'}
                        </button>
                      </div>
                    </form>
                  </section>
                )}
              </motion.div>
            )}

            {activeTab === 'messages' && (
              <motion.div 
                key="messages-tab"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                {role === Role.HOST ? (
                  <section className="bg-slate-900 text-white rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/50 text-white">
                          <MessageSquare className="w-6 h-6" />
                        </div>
                        <h2 className="text-2xl font-black tracking-tight">Admin zpráva</h2>
                      </div>
                      <p className="text-slate-400 text-sm mb-6 font-medium">Máš připomínku k úkolům nebo jsi našel chybu? Pošli rychlý vzkaz administrátorům systému.</p>
                      <form onSubmit={sendFeedback} className="space-y-6">
                        <textarea 
                          placeholder="Např: Zapomněli jste na DU z matiky str 550 cv8..." 
                          className="w-full p-5 bg-slate-800 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[160px] resize-none transition-all text-slate-200 font-medium" 
                          value={feedback} 
                          onChange={(e) => setFeedback(e.target.value)} 
                        />
                        <button className="w-full bg-blue-600 text-white p-5 rounded-xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-900/50 active:scale-95">
                          <Send className="w-5 h-5" />
                          Odeslat administrátorům
                        </button>
                      </form>
                    </div>
                    <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-600/10 rounded-full blur-[100px]"></div>
                  </section>
                ) : (
                  <section className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-[500px]">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <h2 className="font-black text-sm uppercase tracking-widest text-slate-700">Příchozí zprávy</h2>
                      <span className="bg-blue-600 text-white text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-tighter">
                        {messages.length} CELKEM
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      {messages.length === 0 ? (
                        <div className="py-20 text-center italic text-slate-300 font-bold uppercase tracking-widest">Žádné nové zprávy</div>
                      ) : (
                        messages.map((m) => (
                          <div key={m.id} className="bg-slate-50 p-5 rounded-xl border border-slate-100 hover:border-blue-200 transition-all">
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-[10px] font-black font-mono text-blue-600 bg-blue-50 px-3 py-1 rounded-md uppercase tracking-tight">{m.senderId}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase">{m.createdAt?.toDate().toLocaleTimeString('cs-CZ')}</span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed font-semibold">{m.text}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                )}
              </motion.div>
            )}

            {activeTab === 'users' && role === Role.ADMIN && (
              <motion.div 
                key="users-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <section className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="font-black text-sm uppercase tracking-widest text-slate-700">Správa hostů / Ban list</h2>
                  </div>
                  <div className="p-6">
                    <ul className="space-y-4">
                      {allUsers.filter(u => u.uid !== user?.uid).map(u => (
                        <li key={u.uid} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white hover:border-blue-200 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                              ID
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-slate-800">{u.customId}</span>
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{u.uid}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => toggleBan(u.uid)} 
                            className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all active:scale-95 shadow-sm hover:shadow-red-200"
                          >
                            Ban/Unban
                          </button>
                        </li>
                      ))}
                      {allUsers.filter(u => u.uid !== user?.uid).length === 0 && (
                        <div className="py-10 text-center italic text-slate-300 font-bold uppercase tracking-widest">Žádní další uživatelé online</div>
                      )}
                    </ul>
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer info box */}
        <footer className="h-10 bg-white border-t border-slate-100 flex items-center justify-center px-8">
          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-[0.2em] font-bold italic">ukoly © 2026 • SESSION STATE: AKTIVNÍ • ID: {customId}</p>
        </footer>
      </main>
    </div>
  );
}
