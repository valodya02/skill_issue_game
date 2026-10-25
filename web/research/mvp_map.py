# Карта до MVP: что сделано, что проверено прогоном, что осталось.
# Запуск: python web/research/mvp_map.py  ->  web/research/mvp_map.png
import matplotlib.pyplot as plt
import textwrap
from matplotlib.patches import FancyBboxPatch

# статус: ok = сделано и проверено прогоном, done = сделано, прогоном не проверено, todo = нет
C = {"ok": "#3fae6a", "done": "#e8b339", "todo": "#d9534f"}
LABEL = {"ok": "сделано + проверено прогоном", "done": "сделано, не проверено", "todo": "не начато"}

LANES = [
    ("Сервер и мультиплеер\n(Володя хостит)", [
        ("Раунды, фазы, экономика", "ok", "смоук с ботами"),
        ("Боты", "ok", "смоук"),
        ("Бабки и бомба в snapshot", "ok", "смоук: поля есть"),
        ("Закладка / дефьюз бомбы", "done", "живьём не жали G"),
        ("Дезматч", "done", "не гоняли"),
        ("Хост с ноута Володи по сети", "todo", "открыть IP:3000"),
        ("Нагрузка 30-50 игроков", "todo", "бенч комнат"),
    ]),
    ("Физика", [
        ("Коллизии круг/прямоугольник", "ok", "check_server 14/14"),
        ("Пули сквозь тонкий забор", "todo", "Аргон: 360 углов"),
        ("lob / bounce / pierce ядром", "todo", "check_physics"),
        ("Шаг тика <= 2 мс", "todo", "bench p99"),
    ]),
    ("Оружие и баланс", [
        ("16 пушек + молотов + семечки", "ok", "check_balance PASS"),
        ("DPS <= 300, TTK танка >= 4.5 с", "ok", "max 236 DPS"),
        ("Кузница, фолбэк без ключа", "ok", "forge() отдал model"),
        ("Кузница через Ollama Володи", "todo", "нужен IP"),
    ]),
    ("Карта «Спальник»", [
        ("rayon.json, пути до A/B", "done", "проверял Codex, не я"),
        ("2D-рендер", "done", "в браузере не смотрели"),
        ("3D-рендер, 41 draw call", "done", "на заглушке Three"),
    ]),
    ("3D-клиент\n(Володя)", [
        ("Сцена Three.js, FPS-камера", "done", "ветка test_game"),
        ("Склейка со снапшотом сервера", "todo", "game3d.js"),
        ("Модели пушек из рецептов", "done", "parts3d на заглушке"),
    ]),
    ("Персонажи\n(Вадим, Юля)", [
        ("Ресёрч мемов, 35 кандидатов", "ok", "2 источника сошлись"),
        ("Ростер без Бомбардиро/Тралалеро", "todo", "замена 2 из 9"),
        ("9 моделей .glb", "todo", "формат сдачи"),
        ("Анимации idle/run/shoot", "todo", ""),
        ("Крики и звуки", "todo", ""),
    ]),
    ("Демо жюри", [
        ("Экран входа (дизайн)", "done", "канвас, не в коде"),
        ("Сценарий: 2v2, потом dm", "todo", "e2e-прогон 2 ноута"),
        ("Коммит в ветку", "ok", "266a814"),
        ("Пуш в GitHub", "todo", "слово Саши"),
    ]),
]

W_TILE, H_TILE, GAP = 2.35, 0.9, 0.12
LANE_X = 2.6
ncols = max(len(t) for _, t in LANES)
fig_w = LANE_X + ncols * (W_TILE + GAP) + 0.3
fig_h = len(LANES) * (H_TILE + GAP) + 2.8

fig, ax = plt.subplots(figsize=(fig_w * 1.15, fig_h * 1.15))
ax.set_xlim(0, fig_w)
ax.set_ylim(0, fig_h)
ax.axis("off")
fig.patch.set_facecolor("#14161a")

counts = {k: 0 for k in C}
for i, (lane, tiles) in enumerate(LANES):
    y = fig_h - 1.95 - i * (H_TILE + GAP)
    ax.text(LANE_X - 0.15, y + H_TILE / 2, lane, ha="right", va="center",
            color="#e6e6e6", fontsize=10, fontweight="bold")
    for j, (name, st, how) in enumerate(tiles):
        counts[st] += 1
        x = LANE_X + j * (W_TILE + GAP)
        ax.add_patch(FancyBboxPatch((x, y), W_TILE, H_TILE, boxstyle="round,pad=0,rounding_size=0.08",
                                    fc=C[st], ec="none", alpha=0.92))
        ax.text(x + 0.1, y + H_TILE - 0.12, textwrap.fill(name, 24), ha="left", va="top", color="#111",
                fontsize=8.2, fontweight="bold", wrap=True)
        if how:
            ax.text(x + 0.1, y + 0.12, how, ha="left", va="bottom", color="#222", fontsize=7.3, style="italic")

total = sum(counts.values())
ax.text(0.2, fig_h - 0.45, "Brainrot Strike: путь до MVP", color="white", fontsize=16, fontweight="bold")
ax.text(0.2, fig_h - 0.85,
        f"проверено прогоном {counts['ok']}/{total} · сделано без проверки {counts['done']} · не начато {counts['todo']}",
        color="#bbbbbb", fontsize=10)
for k, (st, lab) in enumerate(LABEL.items()):
    x = 0.2 + k * 3.4
    ax.add_patch(FancyBboxPatch((x, 0.25), 0.35, 0.3, boxstyle="round,pad=0,rounding_size=0.05", fc=C[st], ec="none"))
    ax.text(x + 0.5, 0.4, lab, color="#dddddd", fontsize=9, va="center")

out = __file__.replace(".py", ".png")
plt.savefig(out, dpi=140, bbox_inches="tight", facecolor=fig.get_facecolor())
print(out, counts)
