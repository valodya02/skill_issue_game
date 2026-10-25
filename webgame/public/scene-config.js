// Настройки сцены. Меняйте значения и обновляйте страницу (F5).
// Цвета можно задавать как 0xRRGGBB или строкой '#RRGGBB'.
window.SCENE_CONFIG = {
  environment: {
    background: 0x87ceeb,
    fog: { color: 0xa8dcf5, near: 50, far: 110 },
    cameraFov: 72,

    // Блочный пол в стиле Minecraft.
    blockyGround: true,
    blockSize: 2,
    groundColors: [0x5f9f3d, 0x6cab47, 0x548f36, 0x76b94f],

    // Используется, если blockyGround: false.
    floor: {
      color: 0x5f9f3d,
      roughness: 1,
      metalness: 0,
    },

    grid: {
      color: 0x477a30,
      color2: 0x477a30,
      divisions: 20,
    },

    walls: {
      color: 0x6d5233,
      opacity: 1,
      height: 1.5,
    },

    // Деревья: [x, z] или [x, z, высота ствола].
    trees: [
      [-14, -14, 4],
      [14, -12, 5],
      [-12, 13, 4],
      [13, 14, 5],
      [0, -17, 4],
      [-17, 2, 4],
    ],

    lights: {
      hemisphere: {
        sky: 0xcfe8ff,
        ground: 0x557a3a,
        intensity: 1.35,
      },
      sun: {
        color: 0xfff3d6,
        intensity: 2.5,
        position: [25, 45, 18],
      },
    },
  },

  // Настройки рендера для производительности.
  // maxPixelRatio: ограничение плотности пикселей (1–2).
  // shadows: выключите для слабых устройств.
  // shadowMapSize: 1024 быстрее, 2048 качественнее.
  render: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 1024,
  },

  coin: {
    color: 0xffc107,
    emissive: 0xff9800,
    radius: 0.55,
    tube: 0.18,
  },

  // Дополнительные блоки. Это только визуальные объекты:
  // на движение и сбор монет они не влияют.
  // type: 'box' | 'sphere' | 'cylinder' | 'cone'
  // position: [x, y, z], size: [ширина, высота, глубина], rotation: [x, y, z] в радианах.
  decorations: [
    { type: 'box', position: [6, 0.5, 6], size: [2, 1, 2], color: 0x8d8d8d },
    { type: 'box', position: [-6, 0.75, 7], size: [2, 1.5, 2], color: 0x7b7b7b },
    { type: 'box', position: [8, 0.5, -6], size: [2, 1, 2], color: 0x9a8b6a },
  ],
};
