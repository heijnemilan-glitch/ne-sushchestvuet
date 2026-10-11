// InventorySystem — только важные предметы. Предметы имеют описания для осмотра.

export const ITEMS = {
  flashlight: { name: 'Фонарь', desc: 'Тяжёлый армейский фонарь. На корпусе процарапано: «0». Включение — [F].', model: 'flashlight' },
  fuse_a: { name: 'Предохранитель', desc: 'Керамический предохранитель, 40 А. Маркировка: «Щ-1».', model: 'fuse', tag: 'fuse' },
  fuse_b: { name: 'Предохранитель', desc: 'Керамический предохранитель, 40 А. Маркировка: «Щ-2». Завёрнут в личное дело.', model: 'fuse', tag: 'fuse' },
  fuse_c: { name: 'Предохранитель', desc: 'Предохранитель с маркировкой «0-7». Тёплый на ощупь, хотя лежал в холодной комнате.', model: 'fuse', tag: 'fuse' },
  fuse_d: { name: 'Предохранитель', desc: 'Предохранитель без маркировки. На нём — отпечаток пальца, похожий на твой.', model: 'fuse', tag: 'fuse' },
  keycard: { name: 'Пропуск', desc: 'Пропуск: «д-р В. Ланская. Наблюдательный пост». Фотография выцвела так, что лица не видно.', model: 'card', tag: 'keycard' },
  fork: {
    name: 'Камертон',
    desc: 'Стальной камертон с биркой: «НЕ ОСТАВЛЯТЬ БЕЗ ПРИСМОТРА». Иногда слегка вибрирует сам по себе. Его можно положить: [G] или кнопка «Положить».',
    model: 'fork',
  },
  frag1: { name: 'Фрагмент плана I', desc: 'Обрывок плана здания. На нём комната 0-7 — размером с целое крыло. Подпись: «не существует».', model: 'paper', tag: 'fragment' },
  frag2: { name: 'Фрагмент плана II', desc: 'Обрывок плана. Смотровое окно, за ним — штриховка и слово «НЕТ».', model: 'paper', tag: 'fragment' },
  frag3: { name: 'Фрагмент плана III', desc: 'Обрывок плана. Комната пробуждения нарисована дважды — зеркально. Между ними — коридор без длины.', model: 'paper', tag: 'fragment' },
  gasmask: { name: 'Противогаз', desc: 'Старый противогаз ГП-5. Резина потрескалась, стёкла запотевают. Без фильтра бесполезен. Надеть/снять — [M]; надевается сам, если войти в газ.', model: 'gasmask' },
  cutters: { name: 'Болторез', desc: 'Тяжёлый болторез. На рукоятке выцарапано: «ВЫХОД — ВНИЗУ».', model: 'cutters' },
  tape1: { name: 'Кассета 1 · «Институт»', desc: 'VHS-кассета. Наклейка: «Институт памяти. 1987». Её можно пересмотреть в главном меню.', model: 'tape', tag: 'tape' },
  tape2: { name: 'Кассета 2 · «Затопление»', desc: 'VHS-кассета. Наклейка размокла: «…нижний ярус…». Её можно пересмотреть в главном меню.', model: 'tape', tag: 'tape' },
  tape3: { name: 'Кассета 3 · «Оператор»', desc: 'VHS-кассета. Наклейка: «НЕ ДАВАТЬ ОПЕРАТОРУ». Её можно пересмотреть в главном меню.', model: 'tape', tag: 'tape' },
  tape4: { name: 'Кассета 4 · «Испытуемый 0»', desc: 'VHS-кассета. Наклейка твоим почерком. Её можно пересмотреть в главном меню.', model: 'tape', tag: 'tape' },
  map: { name: 'Карта комплекса', desc: 'Сложенный вчетверо план Сектора 0. На полях — карандашные пометки: как отсюда выбраться. Открыть — [M].', model: 'mapitem' },
  part_barrel: { name: 'Ствол', desc: 'Сдвоенный ствол от охотничьего ружья. Внутри чисто — им кто-то занимался. Деталь для сборки на верстаке в мастерской.', model: 'barrel', tag: 'part' },
  part_stock: { name: 'Приклад', desc: 'Деревянный приклад. На нём ножом вырезано: «НЕ ДЛЯ ЛЮДЕЙ». Деталь для сборки на верстаке в мастерской.', model: 'stock', tag: 'part' },
  part_bolt: { name: 'Затвор', desc: 'Ударно-спусковой механизм в промасленной тряпке. Пружина взведена. Деталь для сборки на верстаке в мастерской.', model: 'bolt', tag: 'part' },
  shotgun: { name: 'Ружьё', desc: 'Самодельное двуствольное ружьё. Фонарь примотан изолентой под стволами. Стрелять — левая кнопка мыши, перезарядка сама. Три попадания — и Оно не встанет.', model: 'shotgun' },
  echo_tape: { name: 'Катушка ленты', desc: 'Катушка магнитной ленты, подписанная твоим почерком: «не включай без меня».', model: 'tape' },
};

export class Inventory {
  constructor(bus, data) {
    this.bus = bus;
    this.data = data || { items: [], active: null };
    this.data.counts ||= {};
  }

  // расходники: батарейки, стимуляторы, бутылки, фильтры
  count(kind) {
    return this.data.counts[kind] || 0;
  }

  addCount(kind, n) {
    this.data.counts[kind] = Math.max(0, this.count(kind) + n);
    this.bus.emit('inventory:changed', { counts: kind });
  }

  has(id) {
    return this.data.items.includes(id);
  }

  hasTag(tag) {
    return this.data.items.some((id) => ITEMS[id] && ITEMS[id].tag === tag);
  }

  firstWithTag(tag) {
    return this.data.items.find((id) => ITEMS[id] && ITEMS[id].tag === tag) || null;
  }

  countTag(tag) {
    return this.data.items.filter((id) => ITEMS[id] && ITEMS[id].tag === tag).length;
  }

  add(id) {
    if (this.has(id)) return false;
    this.data.items.push(id);
    this.bus.emit('inventory:changed', { added: id });
    return true;
  }

  remove(id) {
    const i = this.data.items.indexOf(id);
    if (i < 0) return false;
    this.data.items.splice(i, 1);
    if (this.data.active === id) this.data.active = null;
    this.bus.emit('inventory:changed', { removed: id });
    return true;
  }

  get list() {
    return this.data.items.slice();
  }
}
