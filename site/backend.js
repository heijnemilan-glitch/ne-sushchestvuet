// Слой данных сайта: вход через Google и база «Моментов» (Firebase Auth + Firestore).
// Режимы:
//   'firebase' — настоящая база (когда заполнен FIREBASE_CONFIG)
//   'emulator' — локальный эмулятор Firebase для тестов (только на localhost с параметром ?emu)
//   'off'      — база ещё не подключена: сайт работает, а вход и публикация честно недоступны

import { FIREBASE_CONFIG } from './firebase-config.js';

// SDK Firebase 13.0.0 лежит прямо на сайте (site/vendor/firebase) — не зависим от внешних CDN
const SDK = new URL('./vendor/firebase', import.meta.url).href;
const PAGE = 12;

const listeners = new Set();
let fb = null; // модули SDK
let auth = null;
let db = null;

export const backend = {
  mode: 'off',
  user: null, // { uid, name, photo }
  isAdmin: false,

  onAuth(fn) {
    listeners.add(fn);
    fn(this.user);
    return () => listeners.delete(fn);
  },

  get ready() {
    return this.mode !== 'off';
  },
};

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(backend.user);
    } catch (err) {
      console.error(err);
    }
  });
}

export async function initBackend() {
  const params = new URLSearchParams(location.search);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const useEmu = local && params.has('emu');
  const config = useEmu ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-ne-sushchestvuet', appId: 'demo' } : FIREBASE_CONFIG;
  if (!config) return backend;
  try {
    const [app, authMod, fs] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)]);
    fb = { ...authMod, ...fs };
    const fbApp = app.initializeApp(config);
    auth = authMod.getAuth(fbApp);
    db = fs.getFirestore(fbApp);
    if (useEmu) {
      authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      backend.mode = 'emulator';
      // вход без всплывающего окна — только для автотестов в эмуляторе
      window.__testLogin = async (name, sub) => {
        const cred = authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: sub || name, email: `${sub || name}@test.local`, name, email_verified: true }));
        await authMod.signInWithCredential(auth, cred);
      };
    } else backend.mode = 'firebase';
    authMod.onAuthStateChanged(auth, async (u) => {
      backend.user = u ? { uid: u.uid, name: (u.displayName || 'Игрок').slice(0, 60), photo: u.photoURL && u.photoURL.length <= 600 ? u.photoURL : null } : null;
      backend.isAdmin = false;
      if (u) {
        try {
          await fb.setDoc(fb.doc(db, 'users', u.uid), { name: backend.user.name, photo: backend.user.photo, joinedAt: fb.serverTimestamp() }, { merge: true });
          const meta = await fb.getDoc(fb.doc(db, 'meta', 'admins'));
          backend.isAdmin = meta.exists() && (meta.data().uids || []).includes(u.uid);
        } catch (err) {
          console.warn('[backend] профиль', err);
        }
      }
      emit();
    });
  } catch (err) {
    console.error('[backend] не удалось подключить Firebase', err);
    backend.mode = 'off';
    backend.error = err;
  }
  return backend;
}

function need() {
  if (!backend.ready) throw new Error('База данных ещё не подключена.');
}

function needUser() {
  need();
  if (!backend.user) throw new Error('Нужно войти через Google.');
}

export async function signIn() {
  need();
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (err) {
    // если всплывающие окна заблокированы — входим через перенаправление
    if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
      await fb.signInWithRedirect(auth, provider);
    } else if (err && err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') throw err;
  }
}

export async function signOut() {
  need();
  await fb.signOut(auth);
}

function toPost(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    uid: d.uid,
    author: d.author || { name: 'Игрок', photo: null },
    text: d.text || '',
    code: d.code || null,
    codeId: d.codeId || null,
    spoiler: !!d.spoiler,
    thumb: d.thumb,
    w: d.w,
    h: d.h,
    likes: d.likes || 0,
    liked: !!(backend.user && (d.likedBy || []).includes(backend.user.uid)),
    comments: d.comments || 0,
    createdAt: d.createdAt ? d.createdAt.toDate() : new Date(),
  };
}

// Лента: sort = 'new' | 'top'; cursor — последний документ предыдущей страницы.
export async function listPosts({ sort = 'new', cursor = null, uid = null } = {}) {
  need();
  const col = fb.collection(db, 'posts');
  const parts = [];
  if (uid) parts.push(fb.where('uid', '==', uid));
  if (sort === 'top') parts.push(fb.orderBy('likes', 'desc'));
  parts.push(fb.orderBy('createdAt', 'desc'));
  if (cursor) parts.push(fb.startAfter(cursor));
  parts.push(fb.limit(PAGE));
  const snap = await fb.getDocs(fb.query(col, ...parts));
  return { posts: snap.docs.map(toPost), cursor: snap.docs[snap.docs.length - 1] || null, done: snap.docs.length < PAGE };
}

export async function getPost(id) {
  need();
  const s = await fb.getDoc(fb.doc(db, 'posts', id));
  return s.exists() ? toPost(s) : null;
}

export async function getFullImage(id) {
  need();
  const s = await fb.getDoc(fb.doc(db, 'posts', id, 'full', 'img'));
  return s.exists() ? s.data().data : null;
}

export async function createPost({ text, code, codeId, spoiler, thumb, full, w, h }) {
  needUser();
  const ref = fb.doc(fb.collection(db, 'posts'));
  const batch = fb.writeBatch(db);
  batch.set(ref, {
    uid: backend.user.uid,
    author: { name: backend.user.name, photo: backend.user.photo },
    text: text || '',
    code: code || null,
    codeId: codeId || null,
    spoiler: !!spoiler,
    thumb,
    w: Math.round(w),
    h: Math.round(h),
    likes: 0,
    likedBy: [],
    comments: 0,
    createdAt: fb.serverTimestamp(),
  });
  batch.set(fb.doc(db, 'posts', ref.id, 'full', 'img'), { data: full });
  await batch.commit();
  return ref.id;
}

export async function deletePost(id) {
  needUser();
  const comments = await fb.getDocs(fb.collection(db, 'posts', id, 'comments'));
  const batch = fb.writeBatch(db);
  comments.docs.forEach((c) => batch.delete(c.ref));
  batch.delete(fb.doc(db, 'posts', id, 'full', 'img'));
  batch.delete(fb.doc(db, 'posts', id));
  await batch.commit();
}

export async function updatePost(id, { text, spoiler }) {
  needUser();
  await fb.updateDoc(fb.doc(db, 'posts', id), { text, spoiler: !!spoiler });
}

export async function toggleLike(id) {
  needUser();
  const ref = fb.doc(db, 'posts', id);
  const uid = backend.user.uid;
  return fb.runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new Error('Момент удалён.');
    const likedBy = s.data().likedBy || [];
    const liked = likedBy.includes(uid);
    const next = liked ? likedBy.filter((u) => u !== uid) : [...likedBy, uid];
    tx.update(ref, { likedBy: next, likes: next.length });
    return { liked: !liked, likes: next.length };
  });
}

export async function listComments(id) {
  need();
  const snap = await fb.getDocs(fb.query(fb.collection(db, 'posts', id, 'comments'), fb.orderBy('createdAt', 'asc'), fb.limit(200)));
  return snap.docs.map((s) => {
    const d = s.data();
    return { id: s.id, uid: d.uid, author: d.author, text: d.text, createdAt: d.createdAt ? d.createdAt.toDate() : new Date() };
  });
}

export async function addComment(id, text) {
  needUser();
  const ref = fb.doc(fb.collection(db, 'posts', id, 'comments'));
  const batch = fb.writeBatch(db);
  batch.set(ref, { uid: backend.user.uid, author: { name: backend.user.name, photo: backend.user.photo }, text, createdAt: fb.serverTimestamp() });
  batch.update(fb.doc(db, 'posts', id), { comments: fb.increment(1) });
  await batch.commit();
  return ref.id;
}

export async function deleteComment(postId, cid) {
  needUser();
  const batch = fb.writeBatch(db);
  batch.delete(fb.doc(db, 'posts', postId, 'comments', cid));
  batch.update(fb.doc(db, 'posts', postId), { comments: fb.increment(-1) });
  await batch.commit();
}

export async function reportPost(postId, reason) {
  needUser();
  await fb.addDoc(fb.collection(db, 'reports'), { postId, uid: backend.user.uid, reason: String(reason || '').slice(0, 200), createdAt: fb.serverTimestamp() });
}

export async function getUser(uid) {
  need();
  const s = await fb.getDoc(fb.doc(db, 'users', uid));
  return s.exists() ? s.data() : null;
}

// Прямой доступ для автотестов правил безопасности (только в эмуляторе).
export function __raw() {
  return backend.mode === 'emulator' ? { fb, db, auth } : null;
}
