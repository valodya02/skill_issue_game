# skill_issue_game

Каркас файловой архитектуры Unity-проекта (пустые файлы для последующего наполнения).

```
Assets/
├── _Project/
│   ├── Scripts/
│   │   ├── Core/         игровой цикл, состояния, сцены, события, сервисы
│   │   ├── Audio/        менеджер и конфиг звука
│   │   ├── Input/        чтение и конфиг ввода
│   │   ├── UI/           менеджер UI и экраны (меню, HUD, пауза, настройки, game over)
│   │   ├── Gameplay/
│   │   │   ├── Player/   контроллер, движение, здоровье, статы, аниматор
│   │   │   ├── Enemies/  база врага, AI, здоровье, спавнер, статы
│   │   │   ├── Combat/   оружие, снаряды, урон, хитбоксы
│   │   │   ├── Items/    предметы, подбор, инвентарь
│   │   │   ├── Level/    менеджер уровня, чекпоинты, двери, интерактив
│   │   │   └── Camera/   контроллер и тряска камеры
│   │   ├── Systems/
│   │   │   ├── Save/         сохранения (менеджер, данные, интерфейс)
│   │   │   ├── Pooling/      пулы объектов
│   │   │   ├── Localization/ локализация
│   │   │   ├── Analytics/    аналитика
│   │   │   ├── Achievements/ достижения
│   │   │   └── Settings/     настройки
│   │   ├── Data/         конфиги и ScriptableObject-модели данных
│   │   ├── Utils/        синглтон, таймер, расширения, математика, рандом
│   │   └── Tests/        EditMode и PlayMode тесты
│   ├── Prefabs/          Player, Enemies, UI, Items, Levels, Effects
│   ├── Scenes/           Boot, MainMenu, Game
│   ├── Art/              Sprites, Models, Materials, Animations, VFX
│   ├── Audio/            Music, SFX
│   ├── Resources/
│   ├── Settings/         Input Actions и настройки проекта
│   └── ScriptableObjects/ Config, Weapons, Enemies, Items
├── Plugins/
└── ThirdParty/
Packages/
ProjectSettings/
```

Соглашения:
- Вся логика игры — в `Assets/_Project`, сторонние ассеты — в `Assets/ThirdParty`.
- Скрипты группируются по фичам (Player, Enemies, Combat...), а не по типам.
- Данные контента — через ScriptableObject в `Data/` и `ScriptableObjects/`.
- Пустые директории помечены `.gitkeep`.
