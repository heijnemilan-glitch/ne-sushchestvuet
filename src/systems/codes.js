// Коды открытий. Игроки могут сравнивать прохождения: каждый найденный секрет даёт код вида NS-XXXX-XXXX.
// Код содержит номер открытия и «номер мира» (часть seed) плюс контрольную сумму —
// подделанный или опечатанный код не примется. Всё работает офлайн.

import { hashString } from '../core/rng.js';

// Порядок менять нельзя — от него зависят старые коды. Новые открытия — только в конец.
export const DISCOVERIES = [
  { id: 'three_passes', hint: 'Дверь, которую не трогали, открылась сама.' },
  { id: 'forgotten_item', hint: 'Оставленный предмет «прожёг» стену.' },
  { id: 'impossible_route', hint: 'В лифте появился этаж, которого нет на схеме.' },
  { id: 'changed_room', hint: 'Комната пробуждения достроила себе дверь.' },
  { id: 'two_versions', hint: 'В трубке был не тот голос.' },
  { id: 'habit_hand', hint: 'Дверь одного крыла открылась в другое.' },
  { id: 'stillness', hint: 'Он приходит к тем, кто стоит в темноте.' },
  { id: 'echo', hint: 'Кто-то повторил мои шаги с опозданием.' },
  { id: 'worn_path', hint: 'Привычный коридор привёл в отражение.' },
  { id: 'attention', hint: 'Архив открыл скрытый каталог.' },
  { id: 'observer_shift', hint: 'После встречи с ним комнаты меняются.' },
  { id: 'ending_shutdown', hint: 'Кто-то выключил МНЕМУ.' },
  { id: 'ending_operator', hint: 'Кто-то занял место Оператора.' },
  { id: 'ending_copy', hint: 'Кто-то уступил место своей копии.' },
  { id: 'ending_none', hint: 'Кто-то ответил «никто». И это было правдой.' },
  { id: 'stairs_landing', hint: 'Нужный пролёт бесконечной лестницы.' },
  { id: 'room_07', hint: 'Комната за дверью 0-7 больше, чем позволяет здание.' },
  { id: 'glass_room', hint: 'Попал в комнату за смотровым стеклом.' },
  { id: 'ending_escape', hint: 'Кто-то вышел наружу. Под настоящий дождь.' },
  { id: 'ending_water', hint: 'Кто-то слишком долго смотрел в воду.' },
  { id: 'boat', hint: 'Проплыл затопленный тоннель.' },
  { id: 'all_tapes', hint: 'Собрал все четыре кассеты.' },
];

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 символа, без похожих 0/O, 1/I

function enc(n, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s = ALPHA[n & 31] + s;
    n >>>= 5;
  }
  return s;
}

function dec(s) {
  let n = 0;
  for (const ch of s) {
    const v = ALPHA.indexOf(ch);
    if (v < 0) return -1;
    n = n * 32 + v;
  }
  return n;
}

export function worldTag(seed) {
  return enc((seed >>> 0) & 0xfffff, 4);
}

export function makeCode(discoveryId, seed) {
  const index = DISCOVERIES.findIndex((d) => d.id === discoveryId);
  if (index < 0) return null;
  const payload = (index << 15) | ((seed >>> 0) & 0x7fff); // 5 бит номера + 15 бит мира
  const check = hashString(`ns:${payload}`) & 0xfffff;
  return `NS-${enc(payload, 4)}-${enc(check, 4)}`;
}

export function parseCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/\s+/g, '');
  const m = /^NS-?([A-Z2-9]{4})-?([A-Z2-9]{4})$/.exec(code);
  if (!m) return { ok: false, error: 'Неверный формат. Код выглядит так: NS-XXXX-XXXX' };
  const payload = dec(m[1]);
  const check = dec(m[2]);
  if (payload < 0 || check < 0 || (hashString(`ns:${payload}`) & 0xfffff) !== check) {
    return { ok: false, error: 'Код повреждён или не существует.' };
  }
  const index = payload >>> 15;
  const d = DISCOVERIES[index];
  if (!d) return { ok: false, error: 'Это открытие из другой версии игры.' };
  return {
    ok: true,
    code: `NS-${m[1]}-${m[2]}`,
    id: d.id,
    hint: d.hint,
    world: enc(payload & 0x7fff, 3),
  };
}
